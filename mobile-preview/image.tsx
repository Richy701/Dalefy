import { Image as NativeImage } from 'react-native-web';
export function Image({contentFit, contentPosition, transition, cachePolicy, placeholder, placeholderContentFit, ...props}: { contentFit?: string; [prop: string]: unknown }) {
 return <NativeImage {...props} resizeMode={contentFit || 'cover'} />;
}
