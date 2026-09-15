const { execFileSync } = require('node:child_process')
const path = require('node:path')

// Without a Developer ID, electron-builder leaves the bundle carrying Electron's
// own linker-signed signature, which does not seal the renamed bundle. macOS then
// refuses to launch the app once it is moved out of the build folder. An ad-hoc
// signature is enough to make the bundle self-consistent. A real identity, when
// present, is applied by electron-builder after this hook and wins.
exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
}
