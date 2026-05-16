import { registerPrimitive } from './registry.ts';
import Text from './primitives/Text.tsx';
import VStack from './primitives/VStack.tsx';
import HStack from './primitives/HStack.tsx';
import Card from './primitives/Card.tsx';

registerPrimitive('text', Text);
registerPrimitive('vstack', VStack);
registerPrimitive('hstack', HStack);
registerPrimitive('card', Card);
