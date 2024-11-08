type Handler = <Input>(p: Program<Input>) => Program<Input>;

type Program<Input> = {
  with: (h: Handler) => Program<Input>;
  run: (x: Input, history?: any[]) => void;
}

type HandlerFunction = (...any: any[]) => (k: any, r: any) => void;

type Handlers = {
  [key: string]: HandlerFunction,
} & {
  return?: (v: unknown) => void,
}

const handlers = (hs: Handlers): Handler => {
  const handler = <Input>(p: Program<Input>) => {
    return {
      with: (h: Handler) => h(p),
      run: (x: any, history: any) => p.run(x, history),
    }
  };
  return handler as Handler;
};

const program = <Input>(g: (x: Input) => Generator<Input>): Program<Input> => {
  const run = (x: Input, history: any[] = []) => {
    const it = g(x);
    let state = it.next();

    history.forEach((x: any) => {
      state = it.next(x);
    });

    if (state.done) {
      throw ["return", state.value];
    } else {
      // chain run(x, [...history, state.value])
      throw state.value;
    }
  }

  const p: Program<Input> = {
    with: (h: Handler) => h(p),
    run,
  };

  return p;
};

const x = program(function* () {
  // testing!
})
.with(handlers({
  call: (fn, ...args) => (k, r) => {
    fn.with(handlers({
      return: v => () => {
         k.with(handlers({ return: r })).run(v);
      },
    })).run(...args);
  },
}));
