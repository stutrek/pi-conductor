import { Stepper } from './control/stepper';
import { easePolyIn, easePolyOut, easeQuadInOut } from 'd3-ease';

const pins = [5, 6, 13, 25];

(async () => {
    const stepper = new Stepper({
        pinNumbers: pins,
        stepperModel: '28BYJ-48',
    });
    console.time('turn');
    await stepper.turn({
        rotations: 1,
        direction: 1,
        duration: 15,
        easing: easeQuadInOut,
    });
    console.timeEnd('turn');
})();
