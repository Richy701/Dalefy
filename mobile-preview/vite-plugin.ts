import path from 'node:path';
import fs from 'node:fs';
import { transformAsync } from '@babel/core';
import type { Plugin } from 'vite';

export function mobilePreviewPlugin(root:string):Plugin {
  const platform=path.join(root,'mobile-preview/platform.tsx');
  const context=path.join(root,'mobile-preview/context.tsx');
  const adapters:Record<string,string>={
    'react-native':'react-native-web',
    'phosphor-react-native':'@phosphor-icons/react',
    'expo-image':path.join(root,'mobile-preview/image.tsx'),
    'react-native-context-menu-view':path.join(root,'mobile-preview/unavailable.ts'), '@rnmapbox/maps':path.join(root,'mobile-preview/unavailable.ts'),
    'expo-router':platform,'react-native-safe-area-context':platform,'expo-linear-gradient':platform,
    '@react-native-masked-view/masked-view':platform,'expo-blur':platform,'expo-haptics':platform,'expo-clipboard':platform,
    'expo-glass-effect':platform,'expo-symbols':platform,
    '@expo/ui/swift-ui':path.join(root,'mobile-preview/nativeUi.ts'),'@expo/ui/swift-ui/modifiers':path.join(root,'mobile-preview/nativeUi.ts'),
    '@expo/ui/community/pager-view':path.join(root,'mobile-preview/nativeUi.ts'),
  };
  return {name:'mobile-preview-source',enforce:'pre',
    async resolveId(id,importer){
      const web = nativeWebResolution.resolveId(id, importer);
      if (web) return web;
      if(adapters[id])return this.resolve(adapters[id],importer,{skipSelf:true});
      if(id.startsWith('/mobile/')) {
        if (/^\/mobile\/(context\/(Trips|Theme|Brand)Context|hooks\/(useTripRole|useLinkedTravelerId))$/.test(id))return context;
        if(id==='/mobile/services/openDocument')return platform;
        return this.resolve(path.join(root,id.slice(1)),importer,{skipSelf:true});
      }

    },
    async transform(code,id){
      if (!id.startsWith(path.join(root, 'mobile/')) || id.includes('/node_modules/') || !/\.[jt]sx?$/.test(id)) return;
      let source = `import { PreviewDate as Date } from ${JSON.stringify(path.join(root,'mobile-preview/clock.ts'))};\n` + code.replace(/(["'])@\//g, '$1/mobile/');
      if (source.includes('require("expo-image")')) {
        source = `import * as PreviewImage from ${JSON.stringify(path.join(root, 'mobile-preview/image.tsx'))};\n` + source.replaceAll('require("expo-image")', 'PreviewImage');
      }
      // Metro's require() of a bundled image (airline logos) has no browser equivalent: hoist each
      // one into a static import so Vite serves the file and the screen gets a URL instead of throwing.
      const assetImports = new Map<string, string>();
      source = source.replace(/require\((["'])(\/mobile\/assets\/[^"']+\.(?:png|jpe?g|webp|gif))\1\)/g, (_match, _quote, file: string) => {
        let name = assetImports.get(file);
        if (!name) { name = `__previewAsset${assetImports.size}`; assetImports.set(file, name); }
        return name;
      });
      if (assetImports.size) source = [...assetImports].map(([file, name]) => `import ${name} from ${JSON.stringify(file)};`).join('\n') + '\n' + source;
      const result = await transformAsync(source, {
        filename: id, configFile: false, babelrc: false, sourceMaps: true,
        parserOpts: { plugins: ['typescript', 'jsx'] },
        plugins: [['react-native-worklets/plugin', { omitNativeOnlyData: true }]],
      });
      return result?.code ? { code: result.code, map: result.map } : source;
    },
  };
}

export const nativeWebResolution = {
  name: "native-web-dependencies",
  resolveId(id: string, importer?: string) {
      if(importer && /node_modules\/react-native-(reanimated|worklets)/.test(importer) && id.startsWith('.')){
        const resolved=path.resolve(path.dirname(importer),id);
        const web=resolved.replace(/\.js$/,'')+'.web.js';
        if(fs.existsSync(web))return web;
      }
  },
};
