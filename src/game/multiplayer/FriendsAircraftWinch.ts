import type {ControlScheme} from '../controls';
import type {FriendsCraneState} from './FriendsCrane';
import type {FriendsVehicle} from './FriendsExpedition';
export const AIRCRAFT_WINCH_MIN_LENGTH=24,AIRCRAFT_WINCH_MAX_LENGTH=6144,AIRCRAFT_WINCH_SPEED=56,AIRCRAFT_WINCH_RELEASE_MS=650;
export type AircraftWinchState=FriendsCraneState & {vehicleId:string;winchSpeed?:number;releaseProgress?:number};
export type AircraftHookAction='airwinch_hook_connect'|'airwinch_hook_release';
export function aircraftWinchBindings(scheme:ControlScheme){return {raise:scheme==='AZERTY'?'a':scheme==='QWERTY'?'q':'',lower:scheme==='AZERTY'||scheme==='QWERTY'?'e':'',hook:scheme==='AZERTY'||scheme==='QWERTY'?'v':''};}
export function aircraftWinchDirection(value:unknown):-1|0|1{return value===-1?-1:value===1?1:0;}
export function aircraftWinchPose(vehicle:FriendsVehicle){return {x:vehicle.x,y:vehicle.y,z:vehicle.z,rotation:0,angle:vehicle.angle,outletLocal:{x:0,y:0,z:-18}};}
export function createAircraftWinch(vehicle:FriendsVehicle):AircraftWinchState{return {pieceId:-1,vehicleId:vehicle.id,...aircraftWinchPose(vehicle),length:0,mode:'hold',blocked:false,hasWinch:true};}
