export type ResidentConversation='hello'|'join'|'fire'|'arrival'|'woods'|'view'|'meadow';
export const RESIDENT_DIALOGUE = {
  hello: [
    ['Hey! Glad you’re here.', 'There’s my favourite neighbour.'],
    ['Hello! The trees are lovely today.', 'Good to see you out here.'],
    ['Hi! You picked a lovely place to wander.', 'You make this place feel like home.'],
    ['Hey, friend. Taking the scenic route?', 'Nice to have some company.'],
  ],
  join: [
    ['Mind if I warm up with you?', 'I’ll bring the marshmallows.'],
    ['That looks like a good spot for a break.', 'Save me a little warmth.'],
    ['A fire and good company? Count me in.', 'I could sit here for a while.'],
    ['I’ll join you in a moment.', 'One more walk, then a marshmallow.'],
  ],
  fire: [
    ['Golden brown. That’s the plan, anyway.', 'Mine might be more charcoal than marshmallow.'],
    ['Listen to that crackle. No hurry at all.', 'This is my favourite kind of evening.'],
    ['There’s always room for one more here.', 'The world feels warmer with you in it.'],
    ['I came for the marshmallow. Stayed for the company.', 'Just a little longer… I say that every time.'],
  ],
  arrival: [
    ['I like seeing who arrives next.', 'Welcome home, whoever’s on their way.'],
    ['The path back always feels familiar.', 'A little rest before the next walk.'],
    ['Every good adventure starts somewhere.', 'This little corner has grown on me.'],
    ['No rush. The world will still be here.', 'I wonder who we’ll meet today.'],
  ],
  woods: [
    ['I’m listening for the birds.', 'That tree has more patience than I do.'],
    ['I could watch these branches all afternoon.', 'I swear that leaf just waved back.'],
    ['The colours out here are beautiful.', 'A quiet spot. I’ll stay a minute.'],
    ['Taking a little woodland break.', 'It smells like a good day for a walk.'],
  ],
  view: [
    ['Now that’s a view.', 'Worth walking a little farther for this.'],
    ['The horizon never seems to get old.', 'I wonder what’s beyond that water.'],
    ['Just collecting a little sunshine.', 'I wish I could keep this light in a jar.'],
    ['Found another favourite spot.', 'I’ll watch the sky for a bit.'],
  ],
  meadow: [
    ['Stretching my legs before I head back.', 'A good place to stop and breathe.'],
    ['Nothing to do but enjoy this little patch.', 'I’m checking on the greenery.'],
    ['This place makes even a small walk lovely.', 'A little sunshine, then back to the fire.'],
    ['I’m taking the long way home.', 'Just enjoying the quiet for a moment.'],
  ],
} satisfies Record<ResidentConversation,readonly (readonly string[])[]>;
