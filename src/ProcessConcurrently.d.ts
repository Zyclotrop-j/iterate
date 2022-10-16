type IteratorFunction<Q, T extends (...args: any) => any, C> = (item: Q, commonArgs: C, ctx: {
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

interface ProcessConcurrentlyReturn<R> {
    result: R;
    done: number;
    active: number;
    idx: number;
    running: boolean;
    errors: Array<any>;
}

export declare function ProcessConcurrently<T extends IteratorFunction<Q, T, C>, Q, C>(fn: T, idxArg: Iterable<Q>, ctx?: {
    commonArgs?: C,
    concurrency?: number,
    log: (message?: any, ...optionalParams: any[]) => void,
}): ProcessConcurrentlyReturn<ReturnType<T>[]> & Promise<ReturnType<T>[]>;
