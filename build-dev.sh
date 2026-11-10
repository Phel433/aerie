#!/bin/sh
# Copy index.html (a full page) with the local runtime mock and shot helper added, for testing.
sed 's#<script src="https://cdnjs#<script src="dev-mock.js"></script><script src="dev-shot.js"></script>\n<script src="https://cdnjs#' index.html > play.html
