type AnyFunction = (...args: any) => any;

type RunFunction<Q, T extends AnyFunction, C> = (item: Q, commonArgs: C, ctx: {
    idx: number;
    done: number;
    active: number;
    idxArg: Q;
    results: ReturnType<T>[];
    signal: AbortSignal;
    worker: number;
    waiting?: number;
    total?: number;
}) => any;

type RunTime<Q, T extends AnyFunction, C> = {
    new(): {
        run: RunFunction<Q, T, C>
    };
    init: AnyFunction;
    destroy: AnyFunction;
};

type IteratorFunction<Q, T extends AnyFunction, C> = RunFunction<Q, T, C> | RunTime<Q, T, C>;

interface ProcessConcurrentlyReturn<R> {
    result: R;
    done: number;
    active: number;
    idx: number;
    running: boolean;
    errors: Array<any>;
    waiting?: number;
    total?: number;
    concurrency: number;
}

export declare function ProcessConcurrently<T extends IteratorFunction<Q, T extends AnyFunction ? T : T extends RunTime<Q, any, C> ? InstanceType<T>['run'] : never, C>, Q, C>(fn: T, idxArg: Iterable<Q> | AsyncIterable<Q>, ctx?: {
    commonArgs?: C,
    concurrency?: number,
    log: (message?: any, ...optionalParams: any[]) => void,
}): ProcessConcurrentlyReturn<T extends AnyFunction ? ReturnType<T>[] : T extends RunTime<Q, any, C> ? ReturnType<InstanceType<T>['run']>[] : never> & Promise<T extends AnyFunction ? ReturnType<T>[] : T extends RunTime<Q, any, C> ? ReturnType<InstanceType<T>['run']>[] : never>;
