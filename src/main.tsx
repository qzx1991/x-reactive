import Lazyman from './lib';
import { For } from './lib/Components/For';
import { useCtx } from './lib/VirtualElement';
import './style.less';
import { IComponentProp } from './lib/types';
import { CanLazyable, Ref } from './lib/Lazyable';

let arrId = 0;
const arr = [26, 32, 41, 82, 64];
@CanLazyable()
class ABCDE {
    constructor(public id: number, public value: number) {}
}
Lazyman.driveDom();
Lazyman.render(<Test />, 'app');

function Test(
    prop: IComponentProp,
    ctx = useCtx({
        state: {
            arr: randomArr(),
        },
    })
) {
    return (
        <div id='1'>
            <div className='btn-wrapper'>
                <button
                    onClick={() => {
                        ctx.state.arr.sort((a, b) => a.value - b.value);
                    }}
                >
                    sort
                </button>
                <button
                    onClick={() => {
                        ctx.state.arr.shift();
                    }}
                >
                    shift
                </button>
                <button
                    onClick={() => {
                        ctx.state.arr.unshift(
                            new ABCDE(++arrId, ctx.state.arr.length)
                        );
                    }}
                >
                    unshift
                </button>
                <button
                    onClick={() => {
                        ctx.state.arr.push(
                            new ABCDE(++arrId, ctx.state.arr.length)
                        );
                    }}
                >
                    push
                </button>
                <button onClick={() => ctx.state.arr.pop()}>pop</button>
            </div>

            <For
                data={ctx.state.arr}
                key='id'
                render={(i) => <div onClick={() => i.value++}>{i.value}</div>}
            />
        </div>
    );
}

function randomArr(size = 10000) {
    const arr: { id: number; value: number }[] = [];
    for (let i = 0; i < size; i++) {
        arr.push(new ABCDE(++arrId, Math.round(Math.random() * 100)));
    }
    return arr;
}
