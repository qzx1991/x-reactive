import Lazyman from './lib';
import { For } from './lib/Components/For';
import { useCtx } from './lib/VirtualElement';
import './style.less';
import { IComponentProp } from './lib/types';

let arrId = 0;

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
        lifeCycle: {},
    })
) {
    return (
        <div id='1'>
            <div className='btn-wrapper'>
                <button onClick={() => ctx.state.arr.sort()}>sort</button>
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
                <button>pop</button>
            </div>
            <For
                data={ctx.state.arr}
                key='id'
                render={(i) => <div>{i.value}</div>}
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
