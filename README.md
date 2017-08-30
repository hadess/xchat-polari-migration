Migrate xchat-gnome configuration to Polari

Usage
-----

`make install`

If the tool complains that the telepathy configuration file already exists and you
want to wipe your existing Telepathy (not just Polari!) configuration, remove
`~/.local/share/telepathy/mission-control/accounts.cfg` before running `make install`.

TODO
----

- Add support for HexChat (?)
- Add support for xchat
- Add support for Nickserv passwords

References
----------

Telepathy "IDLE" protocol configuration options definition:
https://github.com/TelepathyIM/telepathy-idle/blob/master/data/idle.manager

Original script:
https://github.com/hadess/gnome-demo-content/blob/master/polari-initial-setup.py
