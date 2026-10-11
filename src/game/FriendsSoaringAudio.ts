import { soaringSuspended, type FriendsSoaringState } from './multiplayer/FriendsSoaring';

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
/** An acoustic dead band keeps normal trim sink quiet. Positive lift is pulsed;
 * significant sink is continuous, so pilots can distinguish them by ear. */
export function soaringVarioProfile(climb:number,warning=false){
  if(warning)return {mode:'warning' as const,frequency:240,interval:.38,duration:.18};
  if(climb>=.25){const lift=clamp(climb,.25,8);return {mode:'climb' as const,frequency:620+lift*105,interval:clamp(.72/(1+lift*.65),.12,.65),duration:clamp(.16-lift*.008,.07,.16)};}
  if(climb<=-2)return {mode:'sink' as const,frequency:clamp(340+(climb+2)*30,150,340),interval:0,duration:0};
  return {mode:'quiet' as const,frequency:0,interval:0,duration:0};
}
type Voice={source:AudioScheduledSourceNode;gain:GainNode};
export class FriendsSoaringAudio {
  private tones=new Set<Voice>();private sink?:Voice;private wind?:Voice;private windFilter?:BiquadFilterNode;
  private fabric=new Set<Voice>();private nextTone=0;private nextFabric=0;
  private mode='quiet';private phase?:FriendsSoaringState['phase'];private brake=0;private bank=0;private variant=0;
  constructor(private context:AudioContext,private effects:GainNode,private ambience:GainNode){}
  update(state:FriendsSoaringState|undefined,windBuffer:AudioBuffer|undefined,clothBuffers:AudioBuffer[],effectsEnabled=true,ambienceEnabled=true){
    const c=this.context,now=c.currentTime;
    if(!state||state.phase==='landed'||c.state!=='running'){this.stop();return;}
    const airborne=soaringSuspended(state);
    const profile=soaringVarioProfile(state.climb,state.phase==='collapsed'||state.stall>2.4);
    const mode=airborne&&effectsEnabled?profile.mode:'quiet';
    if(mode!==this.mode){this.stopTones();this.mode=mode;this.nextTone=now;}
    if(mode==='sink'){
      if(!this.sink)this.sink=this.tone(profile.frequency,.035);
      const source=this.sink?.source as OscillatorNode|undefined;
      source?.frequency.setTargetAtTime(profile.frequency,now,.12);
    }else if(mode!=='quiet'&&now>=this.nextTone){
      this.tone(profile.frequency,mode==='warning'?.065:.085,profile.duration);
      this.nextTone=now+profile.interval;
    }
    if(airborne&&ambienceEnabled&&windBuffer){
      if(!this.wind){
        const source=c.createBufferSource(),gain=c.createGain(),filter=c.createBiquadFilter();
        source.buffer=windBuffer;source.loop=true;filter.type='lowpass';filter.Q.value=.5;
        gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(this.ambience);
        this.wind={source,gain};this.windFilter=filter;source.start(now);
      }
      const speed=clamp(state.airspeed/13.5,0,1.2),gust=clamp(state.turbulence,0,1);
      this.wind.gain.gain.setTargetAtTime(clamp(.06+speed*speed*.40+gust*.06*Math.sin(now*2.7),.04,.7),now,.25);
      (this.wind.source as AudioBufferSourceNode).playbackRate.setTargetAtTime(.8+speed*.35,now,.3);
      this.windFilter!.frequency.setTargetAtTime(1100+speed*3900,now,.25);
    }else this.stopWind();
    const controlMoved=Math.abs(state.brake-this.brake)>.10||Math.abs(state.bank-this.bank)>.12;
    const inflate=state.phase==='inflating'&&this.phase!=='inflating';
    if(effectsEnabled&&clothBuffers.length&&now>=this.nextFabric&&(inflate||controlMoved||(airborne&&state.turbulence>.22))){
      const source=c.createBufferSource(),gain=c.createGain();source.buffer=clothBuffers[this.variant++%clothBuffers.length];
      source.playbackRate.value=inflate?.75:.85+clamp(state.turbulence,0,1)*.25;
      const duration=Math.min(1.4,source.buffer.duration/source.playbackRate.value);
      gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(inflate?.13:.055+clamp(state.turbulence,0,1)*.065,now+.025);gain.gain.linearRampToValueAtTime(0,now+duration);
      source.connect(gain);gain.connect(this.effects);const voice={source,gain};this.fabric.add(voice);
      source.onended=()=>{this.fabric.delete(voice);source.disconnect();gain.disconnect();};source.start(now);source.stop(now+duration+.01);
      this.nextFabric=now+(inflate?1.6:controlMoved?.45:1.5);
      this.brake=state.brake;this.bank=state.bank;
    }
    if(!effectsEnabled){for(const voice of this.fabric)this.stopVoice(voice);this.fabric.clear();this.brake=state.brake;this.bank=state.bank;}
    if(clothBuffers.length||!effectsEnabled)this.phase=state.phase;
  }
  private tone(frequency:number,level:number,duration?:number){
    const c=this.context;if(!c.createOscillator)return;
    const source=c.createOscillator(),gain=c.createGain();source.type='sine';source.frequency.value=frequency;
    const now=c.currentTime;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(level,now+.012);
    if(duration)gain.gain.linearRampToValueAtTime(0,now+duration);
    source.connect(gain);gain.connect(this.effects);const voice={source,gain};this.tones.add(voice);
    source.onended=()=>{this.tones.delete(voice);source.disconnect();gain.disconnect();};source.start(now);if(duration)source.stop(now+duration+.01);return voice;
  }
  private stopVoice(voice:Voice){try{voice.source.stop();}catch{/* Already ended. */}voice.source.disconnect();voice.gain.disconnect();}
  private stopTones(){for(const voice of this.tones)this.stopVoice(voice);this.tones.clear();this.sink=undefined;}
  private stopWind(){if(this.wind)this.stopVoice(this.wind);this.wind=undefined;this.windFilter?.disconnect();this.windFilter=undefined;}
  stop(){this.stopTones();this.stopWind();for(const voice of this.fabric)this.stopVoice(voice);this.fabric.clear();this.mode='quiet';this.phase=undefined;this.nextTone=0;this.nextFabric=0;}
}
