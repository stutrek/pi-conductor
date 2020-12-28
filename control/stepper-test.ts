import { Stepper } from './stepper';
import { World } from './world';
import { easePolyIn, easePolyOut, easeQuadInOut } from 'd3-ease';
import { clockTimeToRatio } from './circleUtils';

const pins = [5, 6, 13, 25];

(async () => {
    const world = new World();

    const stepper = new Stepper({
        pinNumbers: pins,
        stepperModel: '28BYJ-48',
    });

    world.addItem('stepper', stepper);
    world.start();

    stepper.addListener('start', () => console.log('starting'));
    stepper.addListener('step', (step) => {
        if (step % 80 === 0) {
            console.log('passed', stepper.getClockTimeString());
        }
    });
    stepper.addListener('finish', () => {
        world.turnOff();
        console.log('finished');
    });

    stepper.turnToTime({
        time: '11:00:00',
        duration: 4,
        direction: 1,
    });

    console.log(world.serialize());
})();
