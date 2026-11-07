#!/bin/sh
# Wrap index.html in the same skeleton the artifact host adds, plus the local runtime mock, for testing.
{ printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'; sed 's#<script src="https://cdnjs#<script src="dev-mock.js"></script><script src="dev-shot.js"></script>\n<script src="https://cdnjs#' index.html; printf '\n</body></html>\n'; } > play.html
