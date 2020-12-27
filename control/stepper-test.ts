import { Stepper } from './stepper';
import { easePolyIn, easePolyOut, easeQuadInOut } from 'd3-ease';
import { clockTimeToRatio } from './circleUtils';

const pins = [5, 6, 13, 25];

(async () => {
    const stepper = new Stepper({
        pinNumbers: pins,
        stepperModel: '28BYJ-48',
    });

    console.log('time to ratio 3:00', clockTimeToRatio('3:00:00'));
    console.log('time to ratio 6:00', clockTimeToRatio('6:00:00'));
    console.log('time to ratio 9:00', clockTimeToRatio('9:00:00'));

    stepper.addListener('start', () => console.log('starting'));
    stepper.addListener('step', (step) => {
        if (step % 80 === 0) {
            console.log('passed', stepper.getClockTimeString());
        }
    });
    stepper.addListener('finish', () => console.log('finished'));

    console.time('turn');
    // await stepper.turnRotations({
    //     rotations: 1,
    //     direction: 1,
    //     duration: 10,
    //     easing: easeQuadInOut,
    // });

    await stepper.turnToTime({
        time: '2:45:00',
        direction: 1,
        duration: 1,
    });

    console.timeEnd('turn');
})();
