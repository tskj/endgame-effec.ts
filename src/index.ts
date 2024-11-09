type Program<Input> = {
  with: (h: Handlers) => Program<Input>;
  withOverride: (h: Handlers) => Program<Input>;
  run: (x: Input) => void;
}

type HandlerFunction = (...any: any[]) => (k: any, r: any) => void;

type Handlers = {
  [key: string]: HandlerFunction,
} & {
  return?: (v: unknown) => void,
}

const program = <Input>(g: (x: Input) => Generator<Input>): Program<Input> => {
  const create_runner = (handlers: any, history: any[]) => (x: Input) => {
    const it = g(x);
    let yielded = it.next();

    history.forEach((x: any) => {
      yielded = it.next(x);
    });

    if (!yielded.done) {
      const value = yielded.value;
      if (!Array.isArray(value)) throw "expected yielded value to be a tuple";
      if (value.length !== 2) throw "expected yielded value to be a 2-tuple";

      const [handlerKey, args] = value;
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
          run: (provided: any) => {
            const new_history = [...history, provided];
            if (is_first_run && false) {
              is_first_run = false;
              const next_value = it.next(provided);
              // we can activate this branch as an optimization for most cases that are single-shot
              // but then we need to figure out how first
              // ..
            } else {
              create_runner(handlers, new_history)(x);
            }
          },
        };
      };

      const k = create_sub_program(handlers, history);
      const r = (returnValue: any) => {
        const returnHandler = handlers['return'];
        if (returnHandler) returnHandler(returnValue)();
      }

      handler(...args)(k, r);
    } else {
      const returnValue = yielded.value;
      const returnHandler = handlers['return'];
      if (returnHandler) returnHandler(returnValue)();
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

const effect = (key: string) => {
  return (...args: any[]) => {
    return [key, args];
  }
}

const call = effect('call');

const y = program(function* (input: number) {
  return input * 7;
});

const x = program(function* () {
  const test = yield call(y, 3);
  return test;
})
.with({
  call: (fn, ...args) => (k, r) => {
    fn.with({
      return: (v: any) => () => {
         k.with({ return: r }).run(v);
      },
    }).run(...args);
  },
  return: v => () => {
    console.log("here is return value of x:", v);
  },
});

x.run([]);
