@echo off
REM Before invoking this script, run 'cd <folder where this script is>'

REM Create folder "xpi", if it doesn't exist already
mkdir xpi 2>nul
del xpi\*.xpi 2>nul

cd sel-blocks-fx_xpi
jar cfM ..\xpi\sel-blocks-global.xpi *

cd ..
