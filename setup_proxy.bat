@echo off
REM Following is for expansion of variables at runtime - e.g. !e! instead of %e%
setlocal EnableDelayedExpansion
SET script_folder=%~dp0
cd %script_folder:~0,-1%

REM Based on https://developer.mozilla.org/en/Setting_up_extension_development_environment and http://kb.mozillazine.org/Profile_folder_-_Firefox
REM This script accepts an optional parameter, which is a name of Firefox profile. Otherwise it uses 'default' profile. Either way, the profile must have been created by Firefox (i.e. its folder name must be in standard format).
if not "%1"=="" (
    set profile=%1
) else (
    set profile=default
)

FOR /D %%c in ("%APPDATA%\Mozilla\Firefox\Profiles\*.%profile%") DO set p=%%c
if defined p (
    set e="%p%\extensions"
    REM If you have not got any extensions in Firefox profile yet, there is no 'extensions' folder. So create it.
    if not exist "!e!" (
      mkdir "!e!"
    )
    
    REM Now set up the actual extensions, unless they are already installed from XPI    
    REM Do not use: echo %CD%.>target-file. Use: cd >target-file. For some reason %CD% doesn't get updated after I change directory.
    if not exist "!e!\selblocks-global@selite.googlecode.com.xpi" (
      cd sel-blocks-fx_xpi
      cd > "!e!\selblocks-global@selite.googlecode.com"
      cd ..
    )
) else (
   echo Could not find a Firefox profile "%profile%"
)
