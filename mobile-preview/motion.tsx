import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
export default function MotionSettings({ reduced }: { reduced: boolean }) {
  return <ReducedMotionConfig mode={reduced ? ReduceMotion.Always : ReduceMotion.System} />;
}
