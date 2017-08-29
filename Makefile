all: tests

install: migrate-xchat.js tests
	gjs migrate-xchat.js

tests: migrate-xchat.js tests/expected-output.cfg tests/expected-settings.txt tests/servlist_.ini
	@rm -rf tests-output/ &&							\
		mkdir tests-output &&							\
		gjs migrate-xchat.js tests/servlist_.ini tests-output/ &&		\
		cmp -s tests-output/accounts.cfg tests/expected-output.cfg &&		\
		cmp -s tests-output/settings.txt tests/expected-settings.txt &&		\
		echo "**** Test success ****"

