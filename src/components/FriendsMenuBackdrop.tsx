import { useEffect, useRef } from 'react';

type SceneFactory = typeof import('../game/rendering/FriendsMenuScene')['createFriendsMenuScene'];
const sceneUpdates = new Set<(factory: SceneFactory) => void>();
// Route and renderer edits update the scenery while preserving form state.
if (import.meta.hot) import.meta.hot.accept('../game/rendering/FriendsMenuScene', module => {
  if (module) sceneUpdates.forEach(update => update(module.createFriendsMenuScene));
});

/** A real world canvas owned by setup, with no review UI or gameplay input. */
export function FriendsMenuBackdrop({ paused }: { paused: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const install = (createFriendsMenuScene: SceneFactory) => {
      if (cancelled || !host.current) return;
      dispose?.();
      dispose = createFriendsMenuScene(host.current, () => pausedRef.current);
    };
    const update = (factory: SceneFactory) => {
      try { install(factory); } catch (error) { console.warn('Friends scenery could not update', error); }
    };
    sceneUpdates.add(update);
    void import('../game/rendering/FriendsMenuScene').then(({ createFriendsMenuScene }) => install(createFriendsMenuScene))
      .catch(error => console.warn('Friends scenery could not initialize', error));
    return () => { cancelled = true; sceneUpdates.delete(update); dispose?.(); };
  }, []);
  return <div className="friends-menu__scenery" aria-hidden="true">
    <div className="friends-menu__world" ref={host} />
    <div className="friends-menu__shade" />
  </div>;
}
