import Lazyman from './lib';
import { useCtx } from './lib/VirtualElement';
Lazyman.driveDom();
Lazyman.render(<Test />, 'app');

function Test(
    prop: {},
    ctx = useCtx({
        state: {
            count: 1,
        },
        lifeCycle: {
            beforeCreate() {
                console.log('before');
            },
            onCreated() {
                console.log('created');
            },
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
