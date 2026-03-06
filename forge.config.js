module.exports = {
  packagerConfig: {
    asar: true,
    icon: 'assets/icons/icon',
    asarUnpack: [
      'src/backend/**',
      'src/db/**',
      'data/**',
      '**/*.node'
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        setupIcon: 'assets/icons/icon.ico'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32']
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        icon: 'assets/icons/icon.icns'
      }
    }
  ]
};