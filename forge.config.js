module.exports = {
  packagerConfig: {
    asar: true,
    icon: 'assets/icons/icon', // SIN extensión
    asarUnpack: [
      'src/backend/**',
      'src/db/**',
      'data/**',
      '**/*.node'
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: 'assets/icons/icon.icns'
      },
      platforms: ['darwin']
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: 'assets/icons/icon.ico'
      },
      platforms: ['win32']
    }
  ]
};