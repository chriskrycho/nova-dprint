"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // node_modules/.pnpm/true-myth@7.1.0/node_modules/true-myth/dist/es/unit.js
  var Unit, unit_default;
  var init_unit = __esm({
    "node_modules/.pnpm/true-myth@7.1.0/node_modules/true-myth/dist/es/unit.js"() {
      Unit = /* @__PURE__ */ Object.create(null);
      unit_default = Unit;
    }
  });

  // node_modules/.pnpm/true-myth@7.1.0/node_modules/true-myth/dist/es/-private/utils.js
  function has(value, key) {
    return typeof value === "object" && value !== null && key in value;
  }
  function safeToString(value) {
    if (has(value, "toString") && typeof value["toString"] === "function") {
      const fnResult = value.toString();
      return typeof fnResult === "string" ? fnResult : JSON.stringify(value);
    } else {
      return JSON.stringify(value);
    }
  }
  var isVoid;
  var init_utils = __esm({
    "node_modules/.pnpm/true-myth@7.1.0/node_modules/true-myth/dist/es/-private/utils.js"() {
      isVoid = (value) => typeof value === "undefined" || value === null;
    }
  });

  // node_modules/.pnpm/true-myth@7.1.0/node_modules/true-myth/dist/es/result.js
  var Variant, ResultImpl, ok, err, Result;
  var init_result = __esm({
    "node_modules/.pnpm/true-myth@7.1.0/node_modules/true-myth/dist/es/result.js"() {
      init_unit();
      init_utils();
      Variant = {
        Ok: "Ok",
        Err: "Err"
      };
      ResultImpl = class _ResultImpl {
        constructor(repr) {
          this.repr = repr;
        }
        static ok(value) {
          return arguments.length === 0 ? new _ResultImpl(["Ok", unit_default]) : (
            // SAFETY: TS does not understand that the arity check above accounts for
            // the case where the value is not passed.
            new _ResultImpl(["Ok", value])
          );
        }
        static err(error) {
          return isVoid(error) ? new _ResultImpl(["Err", unit_default]) : new _ResultImpl(["Err", error]);
        }
        /** Distinguish between the {@linkcode Variant.Ok} and {@linkcode Variant.Err} {@linkcode Variant variants}. */
        get variant() {
          return this.repr[0];
        }
        /**
            The wrapped value.
        
            @throws if you access when the {@linkcode Result} is not {@linkcode Ok}
           */
        get value() {
          if (this.repr[0] === Variant.Err) {
            throw new Error("Cannot get the value of Err");
          }
          return this.repr[1];
        }
        /**
            The wrapped error value.
        
            @throws if you access when the {@linkcode Result} is not {@linkcode Err}
           */
        get error() {
          if (this.repr[0] === Variant.Ok) {
            throw new Error("Cannot get the error of Ok");
          }
          return this.repr[1];
        }
        /** Is the {@linkcode Result} an {@linkcode Ok}? */
        get isOk() {
          return this.repr[0] === Variant.Ok;
        }
        /** Is the `Result` an `Err`? */
        get isErr() {
          return this.repr[0] === Variant.Err;
        }
        /** Method variant for {@linkcode map} */
        map(mapFn) {
          return this.repr[0] === "Ok" ? Result.ok(mapFn(this.repr[1])) : this;
        }
        /** Method variant for {@linkcode mapOr} */
        mapOr(orU, mapFn) {
          return this.repr[0] === "Ok" ? mapFn(this.repr[1]) : orU;
        }
        /** Method variant for {@linkcode mapOrElse} */
        mapOrElse(orElseFn, mapFn) {
          return this.repr[0] === "Ok" ? mapFn(this.repr[1]) : orElseFn(this.repr[1]);
        }
        /** Method variant for {@linkcode match} */
        match(matcher) {
          return this.repr[0] === "Ok" ? matcher.Ok(this.repr[1]) : matcher.Err(this.repr[1]);
        }
        /** Method variant for {@linkcode mapErr} */
        mapErr(mapErrFn) {
          return this.repr[0] === "Ok" ? this : Result.err(mapErrFn(this.repr[1]));
        }
        /** Method variant for {@linkcode or} */
        or(orResult) {
          return this.repr[0] === "Ok" ? this : orResult;
        }
        /** Method variant for {@linkcode orElse} */
        orElse(orElseFn) {
          return this.repr[0] === "Ok" ? this : orElseFn(this.repr[1]);
        }
        /** Method variant for {@linkcode and} */
        and(mAnd) {
          return this.repr[0] === "Ok" ? mAnd : this;
        }
        /** Method variant for {@linkcode andThen} */
        andThen(andThenFn) {
          return this.repr[0] === "Ok" ? andThenFn(this.repr[1]) : this;
        }
        /** Method variant for {@linkcode unwrapOr} */
        unwrapOr(defaultValue) {
          return this.repr[0] === "Ok" ? this.repr[1] : defaultValue;
        }
        /** Method variant for {@linkcode unwrapOrElse} */
        unwrapOrElse(elseFn) {
          return this.repr[0] === "Ok" ? this.repr[1] : elseFn(this.repr[1]);
        }
        /** Method variant for {@linkcode toString} */
        toString() {
          return `${this.repr[0]}(${safeToString(this.repr[1])})`;
        }
        /** Method variant for {@linkcode toJSON} */
        toJSON() {
          const variant = this.repr[0];
          return variant === "Ok" ? { variant, value: this.repr[1] } : { variant, error: this.repr[1] };
        }
        /** Method variant for {@linkcode equals} */
        equals(comparison) {
          return this.repr[0] === comparison.repr[0] && this.repr[1] === comparison.repr[1];
        }
        /** Method variant for {@linkcode ap} */
        ap(r) {
          return r.andThen((val) => this.map((fn) => fn(val)));
        }
        cast() {
          return this;
        }
      };
      ok = ResultImpl.ok;
      err = ResultImpl.err;
      Result = ResultImpl;
    }
  });

  // src/main.ts
  var require_main = __commonJS({
    "src/main.ts"(exports) {
      init_result();
      exports.activate = function activate() {
        let { path: workspacePath } = nova.workspace;
        console.log("YO YO YO");
        let dprintPath = nova.config.get("dprint.path");
        if (typeof dprintPath !== "string") {
        }
        nova.commands.register("dprint.format", () => {
        });
        nova.commands.register("dprint.format-selection", () => {
        });
        nova.commands.register("dprint.save-without-formatting", () => {
        });
      };
    }
  });
  require_main();
})();
