import {describe,it,expect} from 'vitest';
import {surveyRailwaySections} from './FriendsRailwaySurvey';
import type {RailAlignment} from '../world/FriendsRailAlignment';
const route={length:1003} as RailAlignment;
describe('railway construction boundaries',()=>{
  it('finds both mouths to sub-voxel precision and closes a section at a fractional final interval',()=>{
    const sections=surveyRailwaySections(route,d=>d>=75.5&&d<950.2||d>=997.25);
    expect(sections).toHaveLength(2);expect(sections[0].start).toBeCloseTo(75.5,1);expect(sections[0].end).toBeCloseTo(950.2,1);expect(sections[1].start).toBeCloseTo(997.25,1);expect(sections[1].end).toBe(1003);
  });
  it('joins a short interruption without covering a genuine open-air section',()=>{
    const sections=surveyRailwaySections(route,d=>d>100&&d<300||d>360&&d<500||d>700&&d<900,96);
    expect(sections).toHaveLength(2);expect(sections[0].start).toBeCloseTo(100,1);expect(sections[0].end).toBeCloseTo(500,1);expect(sections[1].start).toBeCloseTo(700,1);
  });
});
