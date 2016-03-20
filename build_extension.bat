@echo off
REM Following is for expansion of variables at runtime - e.g. !e! instead of %e%
setlocal EnableDelayedExpansion
SET script_folder=%~dp0
cd %script_folder:~0,-1%

REM Create folder "xpi", if it doesn't exist already
mkdir xpi 2>nul
del xpi\*.xpi 2>nul

cd sel-blocks-fx_xpi
jar cfM ..\xpi\sel-blocks-global.xpi *

cd ..
