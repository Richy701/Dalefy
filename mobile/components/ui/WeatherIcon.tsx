import { Sun, Moon, CloudSun, CloudMoon, Cloud, CloudRain, CloudLightning, CloudSnow, CloudFog } from "phosphor-react-native";
import type { Condition } from "@/services/weather";

/** The icon for a weather condition from /api/weather */
export function WeatherIcon({ condition, isDay = true, size, color }: { condition: Condition; isDay?: boolean; size: number; color: string }) {
  const Icon = {
    clear: isDay ? Sun : Moon,
    partly: isDay ? CloudSun : CloudMoon,
    cloudy: Cloud,
    fog: CloudFog,
    rain: CloudRain,
    snow: CloudSnow,
    storm: CloudLightning,
  }[condition] ?? Cloud;
  return <Icon size={size} color={color} weight="fill" />;
}
