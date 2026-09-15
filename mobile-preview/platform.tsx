import { View, Text, Pressable, Linking } from 'react-native-web';
import { CaretLeft } from '@phosphor-icons/react';
import { usePreview, useTheme } from './context';
export { useRouter, useLocalSearchParams } from './context';
export const Link = {};
function Screen({ options }: any) {
  const { back, route } = usePreview(); const { C } = useTheme();
  if (options.headerShown === false) return null;
  const transparent = options.headerTransparent || !options.title;
  return <View style={[{ height: 48, flexDirection: 'row', alignItems: 'center', zIndex: 50 }, transparent ? { position:'absolute',top:0,left:0,right:0 } : { backgroundColor:C.bg }]}>
    {route.pathname !== '/trip/[id]' && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={{padding:12}}><CaretLeft size={20} color={options.headerTintColor || C.textPrimary}/></Pressable>}
    {!!options.title && <Text style={{color: C.textPrimary,fontSize:17,fontWeight:'600'}}>{options.title}</Text>}
  </View>;
}
export const Stack = { Screen };
export const useSafeAreaInsets = () => ({ top:0, right:0, bottom:0, left:0 });
export const SafeAreaView = View;
export function LinearGradient({ colors, locations, start, end, style, children, ...props }: any) {
  const x=(end?.x ?? 0)-(start?.x ?? 0); const y=(end?.y ?? 1)-(start?.y ?? 0);
  const angle=Math.atan2(x,-y)*180/Math.PI;
  return <View {...props} style={[style,{backgroundImage:`linear-gradient(${angle}deg, ${colors.map((c:string,i:number)=>`${c} ${(locations?.[i] ?? i/(colors.length-1))*100}%`).join(',')})`}]}>{children}</View>;
}
export default function MaskedView({maskElement,style,children}:any) {
  const {colors,locations}=maskElement.props;
  const mask=`linear-gradient(to bottom, ${colors.map((c:string,i:number)=>`${c} ${(locations?.[i] ?? i/(colors.length-1))*100}%`).join(',')})`;
  return <View style={[style,{maskImage:mask,WebkitMaskImage:mask}]}>{children}</View>;
}
export function BlurView({style,children,intensity}:any) { return <View style={[style,{backdropFilter:`blur(${(intensity || 50)/5}px)`}]}>{children}</View>; }
// Device-only side effects intentionally have no browser equivalent.
export const selectionAsync = async () => {};
export const impactAsync = async () => {};
export const notificationAsync = async () => {};
export const ImpactFeedbackStyle = { Light:'light', Medium:'medium', Heavy:'heavy' };
export const NotificationFeedbackType = { Success:'success', Error:'error' };
export const setStringAsync = (text:string) => navigator.clipboard.writeText(text);
export const openDocument = (url:string) => Linking.openURL(url);
