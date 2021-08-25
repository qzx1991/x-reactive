import Lazyman from './lib';
import { useCtx } from './lib/VirtualElement';
import { For, IForRenderOption } from './lib/Components/For';
Lazyman.driveDom();
Lazyman.render(<Test />, 'app');

function Test(
    prop: {},
    ctx = useCtx({
        state: {
            data: gene(),
        },
    })
) {
    return (
        <div>
            <button
                onClick={() => ctx.state.data.push(ctx.state.data.length + 1)}
            >
                push
            </button>
            <button onClick={() => ctx.state.data.pop()}>pop</button>
            <button
                onClick={() =>
                    ctx.state.data.unshift(ctx.state.data.length + 1)
                }
            >
                unshift
            </button>
            <button onClick={() => ctx.state.data.shift()}>shift</button>
            <button onClick={() => ctx.state.data.reverse()}>reverse</button>

            <For
                data={ctx.state.data}
                render={(option: IForRenderOption<{ input: string }>) => (
                    <div>
                        <span onClick={() => ctx.state.data[option.index]++}>
                            {option.index}: {option.value}
                        </span>
                        <button
                            onClick={() =>
                                ctx.state.data.splice(option.index, 1)
                            }
                        >
                            移除
                        </button>
                        <button
                            onClick={() => {
                                ctx.state.data.exchange(
                                    option.index,
                                    +(option.input || 0)
                                );
                            }}
                        >
                            exchange
                        </button>
                        <input
                            value={
                                option.input === undefined ? '' : option.input
                            }
                            onChange={(e: any) =>
                                (option.input = e.target.value)
                            }
                        />
                    </div>
                )}
            />
        </div>
    );
}

function gene(size = 10000) {
    const arr: number[] = [];
    for (let i = 0; i < size; i++) {
        arr.push(i + 1);
    }
    return arr;
}
