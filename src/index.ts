type Handler = <Input>(p: Program<Input>) => Program<Input>;

type Program<Input> = {
  with: (h: Handlers) => Program<Input>;
  withOverride: (h: Handlers) => Program<Input>;
  run: (x: Input, history?: any[]) => void;
}

type HandlerFunction = (...any: any[]) => (k: any, r: any) => void;

type Handlers = {
  [key: string]: HandlerFunction,
} & {
  return?: (v: unknown) => void,
}

const program = <Input>(g: (x: Input) => Generator<Input>): Program<Input> => {
  let handlers: any = {};

  const run = (x: Input, history: any[] = []) => {
    const it = g(x);
    let state = it.next();

    history.forEach((x: any) => {
      state = it.next(x);
    });

    if (!state.done) {
      const value = state.value;
      if (!Array.isArray(value)) throw "expected yielded value to be a tuple";
      if (value.length !== 2) throw "expected yielded value to be a 2-tuple";

      const [handlerKey, args] = value;
      const handler = handlers[handlerKey];
      if (!handler) throw "expected to find handler"

      const k = program(function* () {

      }).with(handlers);
      const r = ''

      handler(...args)(k, r);
    } else {
      const returnValue = state.value;
      const returnHandler = handlers['return'];
      if (returnHandler) returnHandler(returnValue);
    }
  }

  const p: Program<Input> = {
    with: (h: Handlers) => {
      handlers = { ...h, ...handlers };
      // needs to be a new p really
      return p;
    },
    withOverride: (h: Handlers) => {
      handlers = { ...handlers, ...h };
      // needs to be a new p really
      return p;
    },
    run,
  };

  return p;
};

const x = program(function* () {
  // testing!
})
.with({
  call: (fn, ...args) => (k, r) => {
    fn.with({
      return: (v: any) => () => {
         k.with({ return: r }).run(v);
      },
    }).run(...args);
  },
});
