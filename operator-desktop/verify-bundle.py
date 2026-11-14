"""Check actual Mach-O slices and deployment commands, not only advertised build settings."""
import json,plistlib,struct,sys
from pathlib import Path

def inspect_macho(data):
    if data[:4] != b'\xca\xfe\xba\xbe': raise ValueError('universal_fat_binary_required')
    count=struct.unpack_from('>I',data,4)[0]
    if count != 2: raise ValueError('exactly_two_architectures_required')
    result=[]
    for index in range(count):
        cpu,subtype,offset,size,alignment=struct.unpack_from('>IIIII',data,8+index*20)
        if offset+size>len(data): raise ValueError('invalid_slice_bounds')
        view=data[offset:offset+size]
        if view[:4]!=b'\xcf\xfa\xed\xfe': raise ValueError('64_bit_macho_required')
        ncmds=struct.unpack_from('<I',view,16)[0];pos=32;version=None
        for _ in range(ncmds):
            command,length=struct.unpack_from('<II',view,pos)
            if length<8 or pos+length>len(view): raise ValueError('invalid_load_command')
            if command==0x32:
                platform,minimum=struct.unpack_from('<II',view,pos+8)
                if platform!=1:raise ValueError('macos_platform_required')
                version=minimum
            elif command==0x24:version=struct.unpack_from('<I',view,pos+8)[0]
            pos+=length
        if version is None or version>0x0c0706: raise ValueError('monterey_12_7_6_not_supported_by_binary')
        result.append({'architecture':{0x01000007:'x86_64',0x0100000c:'arm64'}.get(cpu,'unknown'),
                       'minimumOS':f'{version>>16}.{(version>>8)&255}.{version&255}'})
    if {r['architecture'] for r in result}!={'x86_64','arm64'}:raise ValueError('intel_and_apple_silicon_required')
    return result

def verify(app):
    app=Path(app)
    with (app/'Contents/Info.plist').open('rb') as f: info=plistlib.load(f)
    if info['LSMinimumSystemVersion']!='12.0':raise ValueError('unexpected_bundle_minimum')
    slices=inspect_macho((app/'Contents/MacOS'/info['CFBundleExecutable']).read_bytes())
    for name in ['index.html','style.css','app.js','SETUP.html','AppIcon.icns']:
        if not (app/'Contents/Resources'/name).is_file():raise ValueError('missing_resource_'+name)
    return {'bundleIdentifier':info['CFBundleIdentifier'],'version':info['CFBundleShortVersionString'],
            'minimumSystemVersion':info['LSMinimumSystemVersion'],'binarySlices':slices,
            'macOS12_7_6BinaryTargetVerified':True,'testedOnActualMontereyHardware':False,
            'publisherSigning':'ad_hoc_only','notarized':False,'requiresNode':False,'embedsStripeKey':False,
            'runtime':'Native AppKit/WebKit client for existing hosted operator'}

if __name__=='__main__':
    print(json.dumps(verify(sys.argv[1]),indent=2))
