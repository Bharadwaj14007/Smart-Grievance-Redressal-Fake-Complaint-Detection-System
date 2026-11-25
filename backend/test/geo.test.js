import { distanceKm } from '../src/utils/geo.js';

describe('distanceKm', () => {
    it('returns zero for the same coordinates', () => {
        expect(distanceKm({ latitude: 28.6, longitude: 77.2 }, { latitude: 28.6, longitude: 77.2 })).toBe(0);
    });

    it('calculates the distance across the antimeridian using the shorter arc', () => {
        expect(distanceKm({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 })).toBeCloseTo(22.24, 1);
    });

    it('calculates a one-degree distance at the equator', () => {
        expect(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(111.2, 1);
    });
});
