export const ratioToClockTime = (ratio: number) => {
    const hours = (ratio * 12) % 12;
    const minutes = (hours % 1) * 60;
    const seconds = (minutes % 1) * 60;

    const hoursInt = hours < 1 ? 12 : Math.floor(hours);
    return [hoursInt, Math.floor(minutes), seconds];
};

export type ClockTime = `${number}:${number}:${number}`;

export const clockTimeToRatio = (clockTime: ClockTime) => {
    const [hours, minutes, seconds] = clockTime.split(':').map(Number);

    const time = hours + minutes / 60 + seconds / 3600;
    return time / 12;
};

export const clockTimeToString = ([hours, minutes, seconds]: number[]) => {
    let secondsString = seconds < 10 ? `0${seconds}` : seconds.toString();

    return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${secondsString}`;
};
