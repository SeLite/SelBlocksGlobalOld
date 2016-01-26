#!/bin/bash
#change dir to where this script is run from:
cd "$( dirname "${BASH_SOURCE[0]}" )"

# Based on https://developer.mozilla.org/en/Setting_up_extension_development_environment and http://kb.mozillazine.org/Profile_folder_-_Firefox
# This script accepts an optional parameter, which is a name of Firefox profile. Otherwise it uses 'default' profile. Either way, the profile must have been created by Firefox (i.e. its folder name must be in standard format).
if [[ "$1" ]]
then
    PROFILE="$1"
else
    PROFILE=default
fi
HOME_FOLDER=~

cd sel-blocks-fx_xpi

if [ "$(uname)" == "Darwin" ]; then
   # According to http://kb.mozillazine.org/Profile_folder_-_Firefox  there are two places for Firefox profile folder on Mac OS:
   # ~/Library/Mozilla/Firefox/Profiles/<profile folder> or ~/Library/Application Support/Firefox/Profiles/<profile folder>
   # But on Mac OS 10.5.8 and 10.9.1 I could see the second folder only. If you can test both, please update this/send this to me.
   EXTENSION_FOLDER="$( echo "$HOME_FOLDER/Library/Application Support/Firefox/Profiles"/*.$PROFILE )"
else
   EXTENSION_FOLDER="$( echo "$HOME_FOLDER/.mozilla/firefox/"*.$PROFILE )"
fi
EXTENSION_FOLDER=$EXTENSION_FOLDER/extensions

# If you haven't got any extensions in Firefox profile yet, there is no 'extensions' folder. So create it.
if [ ! -e "$EXTENSION_FOLDER" ]
then
  mkdir "$EXTENSION_FOLDER"
fi

if [ ! -e "$EXTENSION_FOLDER"/selblocks-global\@selite.googlecode.com.xpi ]
then
  pwd > "$EXTENSION_FOLDER"/selblocks-global@selite.googlecode.com
fi

