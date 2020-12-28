import EventEmitter from 'eventemitter3';
import NanoTimer from 'nanotimer';
import { Stepper } from './stepper';

type Item = Stepper;

type SerializedItem = ReturnType<Item['toSerializable']>;

type WorldEvents = {
    start: () => unknown;
    itemChange: (itemName: string, newData: SerializedItem) => unknown;
};

export class World extends EventEmitter<WorldEvents> {
    timer?: NanoTimer;
    items: Map<string, Item> = new Map();

    start() {
        if (this.timer) {
            return;
        }

        for (const [name, item] of this.items) {
            item.turnOn();
        }

        this.timer = new NanoTimer();
        this.resume();

        process.on('exit', () => {
            this.turnOff();
        });
    }

    pause() {
        this.timer?.clearInterval();
    }

    resume() {
        if (!this.timer) {
            throw new Error('Must start before resuming');
        }
        const continuer = () => {
            for (const [name, item] of this.items) {
                item.step();
            }
        };
        this.timer.setInterval(continuer, '', '50u');
    }

    turnOff() {
        this.pause();
        for (const [name, item] of this.items) {
            item.turnOff();
        }
    }

    addItem(name: string, item: Item) {
        this.items.set(name, item);

        item.on('change', () => {
            this.emit('itemChange', name, item.toSerializable());
        });
    }

    removeItem(name: string) {
        const item = this.items.get(name);
        if (item) {
            item.turnOff();
            this.items.delete(name);
        }
    }

    serialize() {
        const serializedItems: { [index: string]: SerializedItem } = {};
        for (const [name, item] of this.items.entries()) {
            serializedItems[name] = item.toSerializable();
        }
        return serializedItems;
    }
}
