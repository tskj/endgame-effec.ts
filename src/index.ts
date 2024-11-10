import { z, type ZodType } from "zod";

type Program<Input extends unknown[]> = {
  with: (...h: Handlers[]) => Program<Input>;
  withOverride: (...h: Handlers[]) => Program<Input>;
  registeredHandlers: Handlers;
  run: (...x: Input) => void;
}

type HandlerFunction = (...any: any[]) => (k: Program<[unknown]>, r: (x: any) => void) => void;

type Handlers = {
  [key: symbol]: HandlerFunction,
} & {
  return?: (v: any) => void,
}

const keep_symbolic_keys = (obj: any) => {
  const result: any = {};

  for (const key of Object.getOwnPropertySymbols(obj)) {
    result[key] = obj[key];
  }

  return result;
}

const program = <Input extends unknown[]>(g: (...x: Input) => Generator<any>): Program<Input> => {
  const create_runner = (handlers: any, history: any[]) => (...x: Input) => {
    const it = g(...x);
    let yielded = it.next();

    history.forEach((x: any) => {
      yielded = it.next(x);
    });

    if (!yielded.done) {
      const value = yielded.value;
      if (!Array.isArray(value)) throw "expected yielded value to be a tuple";
      if (value.length !== 2) throw "expected yielded value to be a 2-tuple";

      const [handlerKey, args] = value as any;
      const handler = handlers[handlerKey];
      if (!handler) throw "expected to find handler";

      let is_first_run = true;
      const create_sub_program = (handlers: any, history: any[]): Program<Input> => {
        return {
          with: (...h: Handlers[]) => {
            return create_sub_program({ ...Object.assign({}, ...h), ...handlers }, history);
          },
          withOverride: (...h: Handlers[]) => {
            return create_sub_program({ ...handlers, ...Object.assign({}, ...h) }, history);
          },
          registeredHandlers: keep_symbolic_keys(handlers),
          run: (...provided: any) => {
            if (provided.length !== 1) throw "value passed by handler to continuation must be singular";
            const new_history = [...history, provided[0]];
            if (is_first_run && false) {
              is_first_run = false;
              const next_value = it.next(provided);
              // we can activate this branch as an optimization for most cases that are single-shot
              // but then we need to figure out how first
              // ..
            } else {
              create_runner(handlers, new_history)(...x);
            }
          },
        };
      };

      const k = create_sub_program(handlers, history);
      const r = (returnValue: any) => {
        const returnHandler = handlers['return'];
        if (returnHandler) returnHandler(returnValue);
      }

      handler(...args)(k, r);
    } else {
      const returnValue = yielded.value;
      const returnHandler = handlers['return'];
      if (returnHandler) returnHandler(returnValue);
    }
  }

  const create_program = (handlers: any, history: any[]): Program<Input> => {
    return {
      with: (...h: Handlers[]) => {
        return create_program({ ...Object.assign({}, ...h), ...handlers }, history);
      },
      withOverride: (...h: Handlers[]) => {
        return create_program({ ...handlers, ...Object.assign({}, ...h) }, history);
      },
      registeredHandlers: keep_symbolic_keys(handlers),
      run: create_runner(handlers, history),
    };
  };

  return create_program({}, []);
};

/*
type EffectReturnType<Args extends any[], ContinuationInput = unknown, FinalReturn = unknown> = {
  (...args: Args): [symbol, Args];
  readonly handler: unique symbol;
  handle: (h: (...args: Args) => (k: Program<[ContinuationInput]>, r: (x: FinalReturn) => void) => void) => Handlers;
}
*/
const effect = <Args extends any[], ContinuationInput = unknown, FinalReturn = unknown>(
  argsDecoder?: ZodType<Args>,
  continuationInputDecoder?: ZodType<ContinuationInput>,
  finalReturnDecoder?: ZodType<FinalReturn>,
) => {
  const key = Symbol();

  const f = (...args: Args) => {
    return [key, argsDecoder ? argsDecoder.parse(args) : args] as const;
  }

  f.handler = key;

  f.handle = (h: (...args: Args) => (k: Program<[ContinuationInput]>, r: (x: FinalReturn) => void) => void) => {
    return {
      [key]: (...args: any) => (k: any, r: any) => {
        const program = (p: Program<any>): Program<any> => ({
          with: (...whatever) => program(p.with(...whatever)),
          withOverride: (...whatever) => program(p.withOverride(...whatever)),
          registeredHandlers: keep_symbolic_keys(p.registeredHandlers),
          run: v => p.run(continuationInputDecoder ? continuationInputDecoder.parse(v) : v),
        });
        h(...args)(program(k), v => r(finalReturnDecoder ? finalReturnDecoder.parse(v) : v));
      },
    };
  };

  return f;
}

/*************** LIBRARY END *******************/
/*************** LIBRARY END *******************/
/*************** LIBRARY END *******************/
/*************** LIBRARY END *******************/

const call = (() => {
  const prepaid = effect();
  const f = <T extends unknown[]>(program: Program<T>, ...args: T) => prepaid(program, ...args);
  f.handler = prepaid.handler;
  f.handle = prepaid.handle;
  return f;
})()

const w = program(function* (input: number) {
  return input + 1;
});

const y = program(function* (input: number) {
  const value = yield call(w, input);
  return value * 10 + 8;
});

const x = program(function* () {
  const test: number = yield call(y, 2);
  const test2 = yield call(y, test);
  return test2;
})
.with(
  call.handle(
    (fn, ...args) => (k, r) => {
      fn
        .with(k.registeredHandlers)
        .with({
          return: (v: any) => {
            k.with({ return: r }).run(v);
          },
        }).run(...args);
    }
  ))
.with({
  return: v => {
    console.log("here is return value of x:", v);
  },
});

x.run();
