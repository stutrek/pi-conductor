import { Gpio } from 'pigpio';
import NanoTimer from 'nanotimer';

function sleep(ms: number) {
    return new Promise((resolve) => {
        new NanoTimer().setTimeout(resolve, '', `${ms * 1000}u`);
    });
}

const stepperConfigs = {
    '28BYJ-48': {
        stepsPerRotation: 4096,
        resetAfterStep: true,
        delayAfterStep: 1.2,
        pattern: [
            [0, 0, 0, 1],
            [0, 0, 1, 1],
            [0, 0, 1, 0],
            [0, 1, 1, 0],
            [0, 1, 0, 0],
            [1, 1, 0, 0],
            [1, 0, 0, 0],
            [1, 0, 0, 1],
        ],
    },
} as const;

type StepperConfigs = typeof stepperConfigs;
type StepperConfig = StepperConfigs[keyof StepperConfigs];

type Easing = (ratioCompleted: number) => number;

const futureDate = (ms: number) => {
    return new Date(new Date().valueOf() + ms);
};

class Task {
    constructor(
        public stepsTotal: number,
        public direction: 1 | -1,
        public finishTime: Date,
        public easing: Easing = (x) => x,
        public startTime = new Date()
    ) {
        this.msTotal = finishTime.valueOf() - this.startTime.valueOf();

        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
    resolve: (value: PromiseLike<undefined> | undefined) => void = () => {};
    reject: (reason: any) => void = () => {};
    promise: Promise<undefined>;

    isComplete = false;
    msTotal: number;
    stepsSoFar = 0;

    claimNextSteps() {
        const msElapsed = new Date().valueOf() - this.startTime.valueOf();
        const ratioCompleted = Math.min(msElapsed / this.msTotal, 1);

        const easedRatio = this.easing(ratioCompleted);

        const stepsThatShouldHaveBeenCompleted = Math.floor(
            this.stepsTotal * easedRatio
        );

        const stepsThisTime =
            stepsThatShouldHaveBeenCompleted - this.stepsSoFar;
        this.stepsSoFar = stepsThatShouldHaveBeenCompleted;

        if (ratioCompleted === 1) {
            this.isComplete = true;
        }
        return stepsThisTime;
    }

    returnSteps(count: number) {
        this.stepsSoFar -= count;
    }
}

type StepperClassConfig = {
    pinNumbers: number[];
    stepperModel: keyof StepperConfigs;
    gearRatio?: number;
};

export class Stepper {
    constructor({
        pinNumbers,
        stepperModel,
        gearRatio = 1,
    }: StepperClassConfig) {
        this.pins = pinNumbers.map(
            (pinNumber) => new Gpio(pinNumber, { mode: 0 })
        );
        this.stepperConfig = stepperConfigs[stepperModel];
        this.gearRatio = gearRatio;
    }

    gearRatio: number;
    pins: Gpio[];
    stepperConfig: StepperConfig;
    task?: Task;
    timer?: NanoTimer;

    private currentStepPatternIndex = 0;

    private start() {
        if (this.timer) {
            return;
        }
        this.timer = new NanoTimer();
        const continuer = async () => {
            await this.step();
            if (this.task && this.task.isComplete === false) {
                this.timer?.setTimeout(continuer, '', '50u');
            } else {
                this.timer = undefined;
                this.turnOff();
            }
        };
        this.timer.setTimeout(continuer, '', '50u');
    }

    private async step() {
        if (!this.task) {
            return undefined;
        }

        const stepsRequired = this.task.claimNextSteps();
        if (stepsRequired === 0) {
            return;
        }

        for (var i = 0; i < stepsRequired; i++) {
            this.incrementStepPatternIndex();
            const stepPattern = this.stepperConfig.pattern[
                this.currentStepPatternIndex
            ];

            if (this.stepperConfig.delayAfterStep) {
                await sleep(this.stepperConfig.delayAfterStep);
            }

            if (this.stepperConfig.resetAfterStep) {
                for (const pin of this.pins) {
                    pin.digitalWrite(0);
                }
            }

            for (const [pinIndex, pin] of this.pins.entries()) {
                if (stepPattern[pinIndex]) {
                    pin.digitalWrite(stepPattern[pinIndex]);
                }
            }
        }

        if (this.task.isComplete) {
            this.task.resolve(undefined);
            this.turnOff();
        }
    }

    private turnOff() {
        this.task?.reject(undefined);
        this.task = undefined;
        for (const pin of this.pins) {
            pin.digitalWrite(1);
        }
    }

    private incrementStepPatternIndex() {
        if (!this.task) {
            throw new Error('Incrementing step pattern requires a task');
        }
        this.currentStepPatternIndex =
            this.currentStepPatternIndex + this.task.direction;
        if (this.currentStepPatternIndex <= -1) {
            this.currentStepPatternIndex += this.stepperConfig.pattern.length;
        }
        if (this.currentStepPatternIndex >= this.stepperConfig.pattern.length) {
            this.currentStepPatternIndex = 0;
        }
    }

    turn({
        rotations = 1,
        direction = 1 as 1 | -1,
        duration = 5,
        easing = (x: number) => x,
    }) {
        this.task?.reject(undefined);

        const steps =
            rotations * this.stepperConfig.stepsPerRotation * this.gearRatio;
        const finishTime = futureDate(duration * 1000);

        this.task = new Task(steps, direction, finishTime, easing);
        this.start();

        return this.task.promise;
    }
}
