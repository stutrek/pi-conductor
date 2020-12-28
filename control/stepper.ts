import { Gpio } from 'pigpio';
import NanoTimer from 'nanotimer';
import EventEmitter from 'eventemitter3';

import { clockTimeToRatio, ratioToClockTime, ClockTime, clockTimeToString } from './circleUtils';

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

        const stepsThatShouldHaveBeenCompleted = Math.floor(this.stepsTotal * easedRatio);

        const stepsThisTime = stepsThatShouldHaveBeenCompleted - this.stepsSoFar;
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
    startingLocation?: number;
};

type StepperEvents = {
    step: (currentStep: number, task: Task) => unknown;
    finish: (task: Task) => unknown;
    start: (task: Task) => unknown;
    change: () => unknown;
};

export class Stepper extends EventEmitter<StepperEvents> {
    constructor({
        pinNumbers,
        stepperModel,
        gearRatio = 1,
        startingLocation = 12,
    }: StepperClassConfig) {
        super();
        this.pins = pinNumbers.map((pinNumber) => new Gpio(pinNumber, { mode: 0 }));
        this.stepperConfig = stepperConfigs[stepperModel];
        this.gearRatio = gearRatio;

        this.stepsPerRotation = this.stepperConfig.stepsPerRotation * this.gearRatio;

        this.currentStep = (startingLocation / 12) * this.stepsPerRotation;
    }

    gearRatio: number;
    pins: Gpio[];
    stepperConfig: StepperConfig;
    task?: Task;
    currentStep: number;
    destinationStep: number | undefined;
    stepsPerRotation: number;
    isOn = false;

    private currentStepPromise = Promise.resolve();

    private currentStepPatternIndex = 0;

    turnOn() {
        if (this.isOn === false) {
            const stepPattern = this.stepperConfig.pattern[0];
            for (const pin of this.pins) {
                if (stepPattern[0]) {
                    pin.digitalWrite(stepPattern[0]);
                }
            }
            this.isOn = true;
        }
    }

    turnOff() {
        for (const pin of this.pins) {
            pin.digitalWrite(1);
        }
    }

    step() {
        if (!this.task) {
            return undefined;
        }
        const stepsRequired = this.task.claimNextSteps();
        if (stepsRequired === 0) {
            return;
        }

        this.currentStepPromise = this.currentStepPromise.then(async () => {
            if (!this.task) {
                return undefined;
            }

            for (var i = 0; i < stepsRequired; i++) {
                this.incrementStepPatternIndex();
                const stepPattern = this.stepperConfig.pattern[this.currentStepPatternIndex];

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
                this.currentStep += this.task.direction;
                this.emit('step', this.currentStep, this.task);
                this.emit('change');
            }

            if (this.task.isComplete) {
                this.emit('finish', this.task);
                this.emit('change');
                this.task.resolve(undefined);
                this.task = undefined;
            }
        });
    }

    private incrementStepPatternIndex() {
        if (!this.task) {
            throw new Error('Incrementing step pattern requires a task');
        }
        this.currentStepPatternIndex = this.currentStepPatternIndex + this.task.direction;
        if (this.currentStepPatternIndex <= -1) {
            this.currentStepPatternIndex += this.stepperConfig.pattern.length;
        }
        if (this.currentStepPatternIndex >= this.stepperConfig.pattern.length) {
            this.currentStepPatternIndex = 0;
        }
    }

    overwriteCurrentTime(newTime: ClockTime) {
        const ratio = clockTimeToRatio(newTime);
        this.currentStep = ratio * this.stepsPerRotation;
        this.emit('change');
    }

    turnSteps({
        steps,
        direction,
        duration,
        easing = (x: number) => x,
    }: {
        steps: number;
        direction: 1 | -1;
        duration: number;
        easing?: (x: number) => number;
    }) {
        const finishTime = futureDate(duration * 1000);
        this.destinationStep =
            direction === 1 ? this.currentStep + steps : this.currentStep - steps;
        this.task = new Task(steps, direction, finishTime, easing);
        this.emit('start', this.task);
        this.emit('change');

        return this.task.promise;
    }

    turnRotations({
        rotations = 1,
        direction = 1 as 1 | -1,
        duration = 5,
        easing = (x: number) => x,
    }) {
        if (this.task) {
            this.task.reject(new Error('Manually stopped'));
        }

        const steps = rotations * this.stepperConfig.stepsPerRotation * this.gearRatio;

        return this.turnSteps({
            steps,
            direction,
            duration,
            easing,
        });
    }

    turnToTime({
        time,
        direction,
        duration,
        easing,
    }: {
        time: ClockTime;
        direction?: -1 | undefined | 1;
        duration: number;
        easing?: (x: number) => number;
    }) {
        const destinationRatio = clockTimeToRatio(time);

        const destinationStep = Math.round(destinationRatio * this.stepsPerRotation);
        const currentStep = this.currentStep % this.stepsPerRotation;
        const stepsForwards = Math.abs(currentStep - destinationStep);
        const stepsBackwards = this.stepsPerRotation - stepsForwards;

        if (direction === undefined) {
            direction = stepsBackwards > stepsForwards ? 1 : -1;
        }

        this.turnSteps({
            steps: direction === 1 ? stepsForwards : stepsBackwards,
            direction,
            easing,
            duration,
        });
    }

    getClockTime() {
        return ratioToClockTime(this.currentStep / this.stepsPerRotation);
    }

    getClockTimeString() {
        return clockTimeToString(this.getClockTime());
    }

    toSerializable() {
        return {
            currentPosition: this.getClockTimeString(),
            destination: this.destinationStep
                ? clockTimeToString(ratioToClockTime(this.destinationStep / this.stepsPerRotation))
                : undefined,
            taskFinishTime: this.task?.finishTime,
        };
    }
}
