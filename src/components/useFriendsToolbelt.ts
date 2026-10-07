import { useCallback, useEffect, useRef, useState } from 'react';

export const FRIENDS_TOOLBELT_IDLE_MS = 5000;

/** Owned by the arena so opening and closing menus cannot reveal the bar again. */
export function useFriendsToolbelt(){
  const [visible,setVisible]=useState(true);
  const timer=useRef<number|null>(null);
  const reveal=useCallback(()=>{
    if(timer.current!==null)window.clearTimeout(timer.current);
    setVisible(true);
    timer.current=window.setTimeout(()=>{timer.current=null;setVisible(false);},FRIENDS_TOOLBELT_IDLE_MS);
  },[]);
  useEffect(()=>{
    reveal();
    return ()=>{if(timer.current!==null)window.clearTimeout(timer.current);};
  },[reveal]);
  return [visible,reveal] as const;
}
