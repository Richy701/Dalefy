import { Image as NativeImage } from 'react-native-web';
export function Image({contentFit, contentPosition, transition, cachePolicy, placeholder, placeholderContentFit, ...props}: any) {
 return <NativeImage {...props} resizeMode={contentFit || 'cover'} />;
}
