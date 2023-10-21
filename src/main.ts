// Running via stdin: `dprint fmt --stdin <file-path/file-name/extension>`. Here
// I am starting out by using the actual `<file-path>` because that respects
// config, which means there is no need to *manage* config. However, doing it
// that way means just completely reformatting the whole editor and losing track
// of where the cursors is as a result, and it also does not support formatting
// only *parts* of the document.

import Maybe, { just, nothing } from 'true-myth/maybe';
import Result, { match, tryOrElse } from 'true-myth/result';
import { fromMaybe, toMaybe } from 'true-myth/toolbelt';

let { fs, config, notifications, workspace } = nova;

let extension: DprintExtension | undefined;
let topLevelDisposables = new Set<Disposable>();

export function activate() {
   info('activating extension');
   tryToInstall();

   topLevelDisposables.add(workspace.onDidChangePath(_ => {
      extension?.cleanup();
      tryToInstall();
   }));
}

export function deactivate() {
   extension?.cleanup();
   topLevelDisposables.forEach(d => d.dispose());
   topLevelDisposables.clear();
}

const COULD_NOT_FIND_DPRINT =
   `Could not find a copy of dprint to use. Please specify one in the extension settings or project extension settings. (In the future, this extension will bundle its own copy as a fallback!)`;

function tryToInstall() {
   info('installing extension');

   DprintExtension.for(workspace).match({
      Ok: (instance) => {
         info('successfully installed extension');
         extension = instance;
      },
      Err: (reason) => {
         error('failed to install extension:', reason);
         addNotification({
            id: 'dprint.bad-workspace',
            title: 'dprint workspace configuration',
            body: COULD_NOT_FIND_DPRINT,
         });
      },
   });
}

function addNotification({ id, title, body }: {
   id: string;
   title: string;
   body: string;
}) {
   let request = new NotificationRequest(id);
   request.title = l(title);
   request.body = body;
   request.actions = [l('Ok')];

   notifications.add(request).catch((err: unknown) => {
      error(`Failed to add notification: ${err}`);
   });
}

class DprintExtension {
   path: string;

   #disposables: {
      format: Maybe<Disposable>;
      formatSelection: Maybe<Disposable>;
      formatOnSave: Maybe<Disposable>;
      saveWithoutFormatting: Maybe<Disposable>;
      novaConfigDidChange: Maybe<Disposable>;
   };

   #ignoredEditors: Set<TextEditor> = new Set();

   static for(workspace: Workspace): Result<DprintExtension, string> {
      return pathForDprint(workspace).map((path) => new this(path));
   }

   private constructor(path: string) {
      info(`constructing extension for workspace at '${path}'`);
      this.path = path;

      this.#disposables = {
         format: just(nova.commands.register(
            'dprint.format',
            (editor: TextEditor) => {
               info('running `format` from format command');
               return format(editor);
            },
         )),

         // This may not be doable in a good way right now: dprint has top-level
         // caching itself, but Node does *not*. `@dprint/formatter` is the path
         // if I *do* try to implement it, though.
         formatSelection: just(nova.commands.register(
            'dprint.format-selection',
            (editor: TextEditor) => {
               info('running `format` from `formatSelection` command');
               let ranges = editor.selectedRanges;
               for (let range of ranges) {
                  // TODO: call format?
                  // To make this work, I think I would need to cache it
                  // *myself*. Gross.
                  todo('format a range');
               }
            },
         )),

         formatOnSave: Maybe.of(workspace.activeTextEditor).map(activeEditor =>
            activeEditor.onWillSave((editor) => {
               info('running `format` from `formatOnSave`');
               if (this.#ignoredEditors.has(editor)) return;

               return format(editor);
            })
         ),

         saveWithoutFormatting: just(nova.commands.register(
            'dprint.save-without-formatting',
            (editor: TextEditor) => {
               this.#ignoredEditors.add(editor);
               return safely(editor.save(), (reason) => JSON.stringify(reason)).then(
                  result => {
                     this.#ignoredEditors.delete(editor);

                     if (result.isErr) {
                        addNotification({
                           id: 'dprint.error.save-without-formatting',
                           title: 'dprint error',
                           body:
                              `Failed to save without executing dprint formatter. ${result.error}`,
                        });
                     }
                  },
               );
            },
         )),

         novaConfigDidChange: just(config.onDidChange('dprint.general.path', () => {
            pathForDprint(workspace).match({
               Ok: (path) => {
                  info(`updating path to ${path}`);
                  this.path = path;
               },
               Err: (reason) => {
                  addNotification({
                     id: 'dprint.error.missing-dprint',
                     title: 'dprint config error',
                     body: COULD_NOT_FIND_DPRINT,
                  });

                  info(reason);
               },
            });
         })),
      };
   }

   cleanup() {
      Object.values(this.#disposables);
      for (let disposable of Object.values(this.#disposables)) {
         if (disposable.isJust) disposable.value.dispose();
      }
   }
}

function format(editor: TextEditor): Promise<void> {
   // TODO: handle remote documents?
   // TODO: handle unsaved documents using `unsaved://` URI scheme?
   if (editor.document.path) {
      info(`formatting '${editor.document.path}'`);
      return invokeDprintOn(editor.document).then(match({
         Ok(formatted) {
            info('successfully returned');
            return editor.edit((edit) => {
               let range = new Range(0, editor.document.length);
               edit.replace(range, formatted);
               info('edited with formatted code');
            });
         },
         Err(reason) {
            error('failed to format', reason);
            addNotification({
               id: 'dprint.error.format',
               title: 'dprint could not format',
               body: reason,
            });
            return Promise.resolve();
         },
      }));
   } else {
      return Promise.resolve();
   }
}

// NOTE: the workspace might not have a path, I think., as in the case where it
// is a non-rooted Nova project.

function pathForDprint(workspace: Workspace): Result<string, string> {
   let configPath = getConfig(workspace.config, 'dprint.general.path', 'string')
      .or(getConfig(nova.config, 'dprint.general.path', 'string'));

   // When the user has specified a config path, that will override any
   // per-project or global installation.
   if (configPath.isJust) {
      return checkPath(configPath.value);
   }

   // Otherwise, check for a local installation or a global installation to use.
   let dprintOnDisk = Maybe.of(workspace.path).andThen(findDprint);
   return fromMaybe('could not find dprint on disk', dprintOnDisk);
}

function findDprint(startingDir: string): Maybe<string> {
   info(`trying to find local installation, starting from ${startingDir}`);
   return withFs().orElse(withNpm).orElse(withYarn).orElse(withPnpm);

   function withFs(): Maybe<string> {
      return find(startingDir);

      function find(dir: string): Maybe<string> {
         info(`searching in ${dir}`);
         let pkgJsonPath = nova.path.join(dir, 'package.json');
         let hasDep = readPackageJson(pkgJsonPath)
            .map(pkg =>
               Boolean(pkg.dependencies?.dprint) || Boolean(pkg.devDependencies?.dprint)
            ).unwrapOr(false);
         info(`has dep: ${hasDep}`);
         if (hasDep) {
            // TODO: account for hoisting to a parent directory.
            let binPath = nova.path.join(dir, 'node_modules', 'dprint', 'dprint');
            return Maybe.of(nova.fs.stat(binPath))
               .map((stat) => stat.isFile())
               .andThen((isValid) => isValid ? Maybe.just(binPath) : Maybe.nothing());
         } else {
            if (dir === '/') return Maybe.nothing();
            return find(nova.path.dirname(dir));
         }
      }
   }

   function withNpm(): Maybe<string> {
      // TODO: implement npm-based handling
      return Maybe.nothing();
   }

   function withYarn(): Maybe<string> {
      // TODO: implement yarn-based handling
      return Maybe.nothing();
   }

   function withPnpm(): Maybe<string> {
      // TODO: implement pnpm-based handling
      return Maybe.nothing();
   }
}

function checkPath(path: string): Result<string, string> {
   // Technically subject to TOCTOU bugs, and slightly slower by way of doing
   // two stats, but in this case we don't actually care; the point is to (try
   // to) give better error messages.
   if (!fs.access(path, fs.F_OK)) return Result.err(`Path '${path}' does not exist.`);
   if (!fs.access(path, fs.X_OK)) return Result.err(`Path '${path}' is not executable`);
   return Result.ok(path);
}

function invokeDprintOn(document: TextDocument): Promise<Result<string, string>> {
   if (!extension) {
      return asyncErr('Tried to invoke dprint without an installed extension');
   }

   if (!document.path) {
      todo('implement support for formatting paths based on type when missing path');
   }

   let process = new Process(extension.path, {
      args: ['fmt', '--stdin', document.path],
      stdio: 'pipe',
      // cwd: defaults (correctly) to project directory; configurable?
   });

   let { resolve, promise } = defer<Result<string, string>>();

   let outBuffer = new Array<string>();
   process.onStdout((result) => outBuffer.push(result));

   let errBuffer = new Array<string>();
   process.onStderr((reason) => errBuffer.push(reason));

   process.onDidExit((status) => {
      if (status === 0) {
         if (errBuffer.length > 0) {
            resolve(
               Result.err(
                  'process exited successfully but there were errors; not applying formatting'
                     + errBuffer.join(''),
               ),
            );
         } else {
            resolve(Result.ok(outBuffer.join('')));
         }
      } else {
         let statusMessage = `${status}: ${messageForExitCode(status)}`;
         let base = `process exited with a failure (${statusMessage})`;
         let fromStderr = errBuffer.length > 0 ? '\n' + errBuffer.join('') : '';
         let message = `${base}${fromStderr}`;
         resolve(Result.err(message));
      }
   });

   process.start();

   // This little dance, including the assignment at the end, lets TS see that
   // `stdin` is *actually* never defined after this.
   let _stdin = process.stdin?.getWriter();
   if (!_stdin) return asyncErr('could not get a handle to stdin');
   let stdin = _stdin;

   return safely(
      stdin.write(document.getTextInRange(new Range(0, document.length))),
      reason => `failed to write: '${reason}'`,
   ).then(match({
      Ok: () => safely(stdin.ready, reason => `failed to write: '${reason}'`),
      Err: (reason) => asyncErr(reason),
   })).then(match({
      Ok: () => safely(stdin.close(), reason => `failed to close stdin: '${reason}'`),
      Err: (reason) => asyncErr(reason),
   })).then(match({
      Ok: () => promise,
      Err: (reason) => asyncErr(reason),
   }));
}

const ExitCodeMessage = {
   0: 'Success',

   // Error codes
   1: 'General error',
   10: 'Argument parsing error',
   11: 'Configuration resolution error',
   12: 'Plugin resolution error',
   13: 'No plugins found error',
   14: 'No files found',

   // Check error codes
   20: 'dprint `check` found non-formatted files',
};

type ExitCode = keyof typeof ExitCodeMessage;

function messageForExitCode(value: number): string {
   return isCode(value)
      ? ExitCodeMessage[value]
      : `unknown exit code '${value}'`;

   function isCode(value: number): value is ExitCode {
      return Object.keys(ExitCodeMessage).includes(value.toString());
   }
}

interface Deferred<T> {
   promise: Promise<T>;
   resolve: (value: T) => void;
   reject: (reason: unknown) => void;
}

function defer<T>(): Readonly<Deferred<T>> {
   // SAFETY: we will immediately fill in all the values here.
   let deferred: Deferred<T> = {} as Deferred<T>;
   deferred.promise = new Promise((resolve, reject) => {
      deferred.resolve = resolve;
      deferred.reject = reject;
   });
   return deferred;
}

function safely<T, E>(
   promise: Promise<T>,
   onReject: (reason: unknown) => E,
): Promise<Result<T, E>> {
   return promise.then(
      (value) => Result.ok(value),
      (reason) => Result.err(onReject(reason)),
   );
}

function asyncErr<T, E>(reason: E): Promise<Result<T, E>> {
   return Promise.resolve(Result.err(reason));
}

function todo(details: string): never {
   throw (`TODO: ${details}`);
}

function l(s: string): string {
   return nova.localize(s);
}

function info(...values: unknown[]): void {
   if (canLog()) console.info(...values);
}

function log(...values: unknown[]): void {
   console.log(...values);
}

function error(...values: unknown[]): void {
   console.error(...values);
}

function canLog(): boolean {
   return nova.inDevMode()
      || getConfig(nova.config, 'dprint.general.debug-logging', 'boolean')
         .unwrapOr(false);
}

function getConfig(config: Configuration, key: string, type: 'string'): Maybe<string>;
function getConfig(config: Configuration, key: string, type: 'boolean'): Maybe<boolean>;
function getConfig(config: Configuration, key: string, type: 'number'): Maybe<number>;
function getConfig(config: Configuration, key: string, type: 'array'): Maybe<string[]>;
function getConfig(
   config: Configuration,
   key: string,
   type: 'string' | 'boolean' | 'number' | 'array',
): Maybe<string | boolean | number | string[]> {
   return Maybe.of(config.get(key))
      .andThen((value) => {
         switch (type) {
            case 'array':
               return Array.isArray(value) ? just(value) : nothing();
            case 'boolean':
            case 'number':
            case 'string':
               return typeof value === type ? just(value) : nothing();
            default:
               unreachable(type);
         }
      });
}

function readPackageJson(filePath: string): Maybe<Package> {
   let fd = toMaybe(
      tryOrElse(identity, () => nova.fs.open(filePath) as FileTextMode),
   );

   return fd
      .andThen(fd => Maybe.of(fd.read()))
      .tap(() => console.log('successfully got an fd'))
      .andThen(s => toMaybe(tryOrElse(identity, JSON.parse(s))))
      .tap((parsed) => info(`parsed: ${parsed}`))
      .andThen((contents) =>
         isPackageJson(contents) ? Maybe.just(contents) : Maybe.nothing<Package>()
      );
}

declare module 'true-myth/maybe' {
   export interface Just<T> {
      tap(cb: (value: T) => void): Maybe<T>;
   }

   export interface Nothing<T> {
      tap(cb: (value: T) => void): Maybe<T>;
   }
}

Maybe.prototype.tap = function<T>(this: Maybe<T>, cb: (value: T) => void): Maybe<T> {
   if (this.isJust) {
      cb(this.value);
   }

   return this;
};

function isPackageJson(obj: unknown): obj is Package {
   return isObject(obj)
      && (('dependencies' in obj && isObject(obj.dependencies))
         || ('devDependencies' in obj && isObject(obj.devDependencies)));
}

function isObject(value: unknown): value is object {
   return typeof value === 'object' && !!value;
}

interface Package {
   dependencies?: Record<string, string>;
   devDependencies?: Record<string, string>;
}

function identity<A>(a: A): A {
   return a;
}

function unreachable(x: never): never {
   throw new Error(`Should be unreachable with value ${x}`);
}
