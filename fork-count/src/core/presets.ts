import type { BufMode } from './interp';

export interface Preset {
  id: string;
  name: string;
  mode: BufMode;
  note: string;
  code: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'loop3',
    name: 'Three forks in a loop',
    mode: 'line',
    note: 'Each fork doubles the number of processes, so 2^3 = 8 processes print.',
    code: `#include <stdio.h>
#include <unistd.h>

int main(void) {
    for (int i = 0; i < 3; i++)
        fork();
    printf("hello\\n");
    return 0;
}`,
  },
  {
    id: 'buffer',
    name: 'Buffered output copied at fork',
    mode: 'line',
    note: '"hello " has no newline, so it is still in the stdio buffer when fork copies the process. Both copies flush it.',
    code: `#include <stdio.h>
#include <unistd.h>

int main(void) {
    printf("hello ");
    fork();
    printf("world\\n");
    return 0;
}`,
  },
  {
    id: 'pipe',
    name: 'Same loop, output to a pipe',
    mode: 'full',
    note: 'With stdout redirected to a file or pipe it is fully buffered: nothing is written until exit, and every line printed before a fork is duplicated.',
    code: `#include <stdio.h>
#include <unistd.h>

int main(void) {
    for (int i = 0; i < 2; i++) {
        fork();
        printf("%d\\n", i);
    }
    return 0;
}`,
  },
  {
    id: 'wait',
    name: 'Parent waits for child',
    mode: 'line',
    note: 'wait() is a happens-before edge: "parent" can only print after the child exits.',
    code: `#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void) {
    printf("start\\n");
    if (fork() == 0) {
        printf("child\\n");
        exit(0);
    }
    wait(NULL);
    printf("parent\\n");
    return 0;
}`,
  },
  {
    id: 'logic',
    name: 'fork() && fork() || fork()',
    mode: 'line',
    note: 'Short-circuit evaluation decides which processes call the later forks: 5 processes, not 8.',
    code: `#include <stdio.h>
#include <unistd.h>

int main(void) {
    fork() && fork() || fork();
    printf("x\\n");
    return 0;
}`,
  },
  {
    id: 'loopi',
    name: 'Printing the loop counter',
    mode: 'line',
    note: 'Children inherit i: the two processes alive in the first iteration print 0, all four print 1, and a 1 can come before the second 0.',
    code: `#include <stdio.h>
#include <unistd.h>

int main(void) {
    for (int i = 0; i < 2; i++) {
        fork();
        printf("%d\\n", i);
    }
    return 0;
}`,
  },
  {
    id: 'memory',
    name: 'Separate memory',
    mode: 'line',
    note: 'After fork each process has its own copy of x.',
    code: `#include <stdio.h>
#include <unistd.h>

int main(void) {
    int x = 1;
    if (fork() == 0)
        x = x + 1;
    else
        x = x - 1;
    printf("x = %d\\n", x);
    return 0;
}`,
  },
  {
    id: 'exit',
    name: 'exit() vs _exit()',
    mode: 'line',
    note: '_exit skips the stdio flush, so the child\'s copy of "A" is lost.',
    code: `#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void) {
    printf("A");
    if (fork() == 0)
        _exit(0);
    wait(NULL);
    printf("B\\n");
    return 0;
}`,
  },
  {
    id: 'exec',
    name: 'exec replaces the process',
    mode: 'line',
    note: 'execlp never returns on success; the child\'s unflushed "before " is discarded with its old image.',
    code: `#include <stdio.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void) {
    printf("before ");
    if (fork() == 0) {
        execlp("echo", "echo", "hi", NULL);
        printf("never\\n");
    }
    wait(NULL);
    printf("done\\n");
    return 0;
}`,
  },
  {
    id: 'waitpid',
    name: 'waitpid on the second child',
    mode: 'line',
    note: 'The parent waits only for B, so A may still print after "parent".',
    code: `#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void) {
    pid_t a = fork();
    if (a == 0) { printf("A\\n"); exit(0); }
    pid_t b = fork();
    if (b == 0) { printf("B\\n"); exit(0); }
    waitpid(b, NULL, 0);
    printf("parent\\n");
    return 0;
}`,
  },
  {
    id: 'status',
    name: 'Exit status',
    mode: 'line',
    note: 'WEXITSTATUS reads the value the child passed to exit().',
    code: `#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>
#include <unistd.h>

int main(void) {
    int status;
    if (fork() == 0)
        exit(3);
    wait(&status);
    printf("child exited with %d\\n", WEXITSTATUS(status));
    return 0;
}`,
  },
  {
    id: 'write',
    name: 'write() bypasses the buffer',
    mode: 'line',
    note: 'write(2) goes straight to the file descriptor; printf waits in the buffer.',
    code: `#include <stdio.h>
#include <unistd.h>

int main(void) {
    printf("A");
    write(1, "B", 1);
    fork();
    printf("C\\n");
    return 0;
}`,
  },
  {
    id: 'orphan',
    name: 'Orphan child',
    mode: 'line',
    note: 'The parent may exit first; the child is adopted by init and still prints. Step through the "child first" and "parent first" schedules.',
    code: `#include <stdio.h>
#include <unistd.h>

int main(void) {
    if (fork() == 0) {
        printf("child\\n");
        return 0;
    }
    printf("parent done\\n");
    return 0;
}`,
  },
];
