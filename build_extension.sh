#!/bin/bash
#change dir to where this script is run from:
cd "$( dirname "${BASH_SOURCE[0]}" )"

# Create folder "xpi", if it doesn't exist already
mkdir xpi 1>/dev/null 2>&1
rm -f xpi/*

cd sel-blocks-fx_xpi

zip -r ../xpi/sel-blocks-global.xpi *

