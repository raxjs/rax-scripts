const path = require('path');
const fs = require('fs-extra');
const { platformMap } = require('miniapp-builder-shared');
const { setConfig } = require('miniapp-runtime-config');
const { setAppConfig: setAppCompileConfig, setComponentConfig: setComponentCompileConfig } = require('miniapp-compile-config');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const setEntry = require('./setEntry');
const { GET_RAX_APP_WEBPACK_CONFIG, MINIAPP_COMPILED_DIR } = require('./constants');

module.exports = (api) => {
  const { getValue, context, registerTask, onGetWebpackConfig, registerUserConfig } = api;
  const { userConfig } = context;
  const { targets, inlineStyle } = userConfig;

  const getWebpackBase = getValue(GET_RAX_APP_WEBPACK_CONFIG);
  targets.forEach((target) => {
    if (['miniapp', 'wechat-miniprogram', 'bytedance-microapp'].includes(target)) {
      const chainConfig = getWebpackBase(api, {
        target,
        babelConfigOptions: { styleSheet: inlineStyle, disableRegenerator: true },
        progressOptions: {
          name: platformMap[target].name,
        },
      });
      chainConfig.name(target);
      chainConfig.taskName = target;
      const isCompileProject = userConfig[target] && userConfig[target].buildType === 'compile';
      // Set Entry when it's runtime project
      if (!isCompileProject) {
        setEntry(chainConfig, context);
      }
      // Register task
      registerTask(target, chainConfig);
      registerUserConfig({
        name: target,
        validation: 'object',
      });

      onGetWebpackConfig(target, (config) => {
        const { rootDir } = context;
        const { outputDir = 'build' } = userConfig;
        // Set output dir
        const outputPath = path.resolve(rootDir, outputDir, target);
        config.output.path(outputPath);

        const needCopyDirs = [];

        // Copy src/miniapp-native dir
        if (fs.existsSync(path.resolve(rootDir, 'src', 'miniapp-native'))) {
          needCopyDirs.push({
            from: path.resolve(rootDir, 'src', 'miniapp-native'),
            to: path.resolve(rootDir, outputDir, target, 'miniapp-native'),
          });
        }

        // Copy public dir
        if (config.plugins.has('CopyWebpackPlugin')) {
          config.plugin('CopyWebpackPlugin').tap(([copyList]) => {
            return [copyList.concat(needCopyDirs)];
          });
        } else if (needCopyDirs.length > 0) {
          config
            .plugin('CopyWebpackPlugin')
            .use(CopyWebpackPlugin, [needCopyDirs]);
        }

        if (isCompileProject) {
          setAppCompileConfig(config, userConfig[target] || {}, { target, context, outputPath, entryPath: './src/app' });
        } else {
          setConfig(config, userConfig[target] || {}, {
            context,
            target,
            babelRuleName: 'babel-loader',
            modernMode: true,
          });

          // If miniapp-compiled dir exists, register a new task
          const compiledComponentsPath = path.resolve(rootDir, 'src', MINIAPP_COMPILED_DIR);
          if (fs.existsSync(compiledComponentsPath)) {
            const compiledComponentsChainConfig = getWebpackBase(api, {
              target: 'rax-compiled-components',
              babelConfigOptions: { styleSheet: inlineStyle, disableRegenerator: true },
            });
            compiledComponentsChainConfig.plugins.delete('ProgressPlugin');
            compiledComponentsChainConfig.name('rax-compiled-components');
            compiledComponentsChainConfig.taskName = 'rax-compiled-components';

            setComponentCompileConfig(
              compiledComponentsChainConfig,
              { disableCopyNpm: true },
              {
                target,
                context,
                outputPath: path.resolve(rootDir, outputDir, target, MINIAPP_COMPILED_DIR),
                entryPath: path.join('src', MINIAPP_COMPILED_DIR, 'index'),
              },
            );
            registerTask('rax-compiled-components', compiledComponentsChainConfig);
          }
        }
      });
    }
  });
};