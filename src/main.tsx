import Lazyman from './lib';
import { Lazyable } from './lib/Lazyable';
import { useCtx } from './lib/VirtualElement';
Lazyman.driveDom();
const data = Lazyable({ count: 1 });
Lazyman.render(<Test />, 'app');

function Test(
    prop: {},
    ctx = useCtx({
        state: {
            count: 1,
        },
    })
) {
    return (
        <div>
            <div>lkmasdlkms</div>
            <div onClick={() => ctx.state.count++}>{ctx.state.count}</div>
        </div>
    );
}
