em++ -lembind -std=gnu++17 -DNUM_SCREENS=7 \
~/src/btclock_v3_2024/lib/btclock/utils.cpp  ~/src/btclock_v3_2024/lib/btclock/data_handler.cpp \
-o src/js/btclock_datahandler.js \
-sEXPORTED_RUNTIME_METHODS=ccall \
--no-entry