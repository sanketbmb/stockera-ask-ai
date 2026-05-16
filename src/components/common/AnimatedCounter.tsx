import CountUp from "react-countup";
import { useInView } from "react-intersection-observer";

interface Props {
  end: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}

export function AnimatedCounter({ end, prefix, suffix, decimals = 0, duration = 1.6, className }: Props) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });
  return (
    <span ref={ref} className={className}>
      {inView ? (
        <CountUp end={end} duration={duration} prefix={prefix} suffix={suffix} decimals={decimals} separator="," />
      ) : (
        <>{prefix}0{suffix}</>
      )}
    </span>
  );
}

export default AnimatedCounter;
