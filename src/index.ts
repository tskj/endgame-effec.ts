import { number, tuple } from "typescript-json-decoder";

type Program<Input extends unknown[]> = {
  with: (h: Handlers) => Program<Input>;
  withOverride: (h: Handlers) => Program<Input>;
  run: (...x: Input) => void;
}

type HandlerFunction = (...any: any[]) => (k: Program<[unknown]>, r: (x: unknown) => void) => void;

type Handlers = {
  [key: symbol]: HandlerFunction,
} & {
  return?: (v: unknown) => void,
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
          with: (h: Handlers) => {
            return create_sub_program({ ...h, ...handlers }, history);
          },
          withOverride: (h: Handlers) => {
            return create_sub_program({ ...handlers, ...h }, history);
          },
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
      with: (h: Handlers) => {
        return create_program({ ...h, ...handlers }, history);
      },
      withOverride: (h: Handlers) => {
        return create_program({ ...handlers, ...h }, history);
      },
      run: create_runner(handlers, history),
    };
  };

  return create_program({}, []);
};

/**
 * what I want is first argument to effect to be a zod validator that
 * checks the inputs to the handler
 * I want the second argument to be a zod validator that is used for the provided next value
 * to the continuation
 * and I want the third parameter to be a zod validator for the return value of the entire program
 */
const id = <T>(x: T): T => x;
const effect = <Args extends any[], ContinuationInput, ContinuationReturn, FinalReturn>(
  argsDecoder: (x: any) => Args = id,
  continuationInputDecoder: (x: any) => ContinuationInput = id,
  continuationReturnDecoder: (x: any) => ContinuationReturn = id,
  finalReturnDecoder: (x: any) => FinalReturn = id) => {
  const key = Symbol();

  const f = (...args: any[]) => {
    return [key, argsDecoder(args)];
  }

  f.handler = key;

  return f;
}

/*************** LIBRARY END *******************/
/*************** LIBRARY END *******************/
/*************** LIBRARY END *******************/
/*************** LIBRARY END *******************/

/**
 * so here I would call it with the three validators
 * but notice that I want the input params of the function in the first
 * validator to align with the second validator, and I want the return value of
 * the function in the first validator to align with the third validator
 */
const decodeProgram: <T>(x: any) => {run: (y: T) => void} = id;
const call = effect(tuple(decodeProgram, number));

const y = program(function* (input: number) {
  return input * 10 + 8;
});

const x = program(function* () {
  const test = yield call(y, 2);
  const test2 = yield call(y, test);
  return test2;
})
.with({
  [call.handler]: (fn, ...args) => (k, r) => {
    fn.with({
      return: (v: any) => {
         k.with({ return: r }).run(v);
      },
    }).run(...args);
  },
  return: v => {
    console.log("here is return value of x:", v);
  },
});

x.run();
