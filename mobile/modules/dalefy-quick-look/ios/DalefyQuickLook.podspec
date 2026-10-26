Pod::Spec.new do |s|
  s.name           = 'DalefyQuickLook'
  s.version        = '1.0.0'
  s.summary        = 'In-app document preview with Quick Look'
  s.author         = ''
  s.homepage       = 'https://dalefy.vercel.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
end
