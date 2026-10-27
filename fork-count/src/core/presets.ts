import type { BufMode } from './interp';

export interface Preset {
  id: string;
  name: string;
  mode: BufMode;
  note: string;
  code: string;
}

const PIPE_HEAD = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>
`;

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
    name: 'Same loop, stdout redirected to a file',
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
  // ---- pipes ----
  {
    id: 'pipe-hello',
    name: 'Pipe: parent sends a message',
    mode: 'line',
    note: 'read() blocks until the parent writes, so the child cannot print first. Each side closes the end it does not use.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char buf[32];
    pipe(fd);
    if (fork() == 0) {
        close(fd[1]);
        int n = read(fd[0], buf, sizeof(buf) - 1);
        buf[n] = '\\0';
        printf("child got: %s\\n", buf);
        exit(0);
    }
    close(fd[0]);
    write(fd[1], "hello", 5);
    close(fd[1]);
    wait(NULL);
    printf("parent done\\n");
    return 0;
}`,
  },
  {
    id: 'pipe-reply',
    name: 'Pipe: child reports back',
    mode: 'line',
    note: '"waiting" and "child writing" race, but the parent can only print what it read after the child has written it.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char buf[32];
    pipe(fd);
    if (fork() == 0) {
        close(fd[0]);
        printf("child writing\\n");
        write(fd[1], "ready", 6);
        exit(0);
    }
    close(fd[1]);
    printf("waiting\\n");
    read(fd[0], buf, sizeof(buf));
    printf("parent read: %s\\n", buf);
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-int',
    name: 'Pipe: sending an int',
    mode: 'line',
    note: 'write(fd, &sum, sizeof sum) sends the 4 bytes of the int; the parent reads them back into its own variable. Separate memory, so a pipe is how the result travels.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    pipe(fd);
    if (fork() == 0) {
        int sum = 0;
        for (int i = 1; i <= 10; i++)
            sum += i;
        close(fd[0]);
        write(fd[1], &sum, sizeof(sum));
        exit(0);
    }
    int total = 0;
    close(fd[1]);
    read(fd[0], &total, sizeof(total));
    printf("child says the sum is %d\\n", total);
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-eof',
    name: 'Pipe: read until end of file',
    mode: 'line',
    note: 'read() returns 0 only when the pipe is empty and every write end is closed. Fork Count delivers each write() as one unit.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char buf[16];
    int n;
    pipe(fd);
    if (fork() == 0) {
        close(fd[1]);
        while ((n = read(fd[0], buf, sizeof(buf) - 1)) > 0) {
            buf[n] = '\\0';
            printf("got [%s]\\n", buf);
        }
        printf("end of file\\n");
        exit(0);
    }
    close(fd[0]);
    write(fd[1], "one", 3);
    write(fd[1], "two", 3);
    write(fd[1], "three", 5);
    close(fd[1]);
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-noclose',
    name: 'Pipe: reader forgets close(fd[1])',
    mode: 'line',
    note: 'The child still holds a write end itself, so its read() never sees end of file, and the parent waits forever for the child. Every schedule hangs.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char buf[16];
    int n;
    pipe(fd);
    if (fork() == 0) {
        /* forgot: close(fd[1]); */
        while ((n = read(fd[0], buf, sizeof(buf) - 1)) > 0) {
            buf[n] = '\\0';
            printf("got [%s]\\n", buf);
        }
        printf("end of file\\n");
        exit(0);
    }
    close(fd[0]);
    write(fd[1], "one", 3);
    close(fd[1]);
    wait(NULL);
    printf("parent done\\n");
    return 0;
}`,
  },
  {
    id: 'pipe-parent-noclose',
    name: 'Pipe: parent keeps its write end',
    mode: 'line',
    note: 'The child exits, but the parent never closed its own copy of the write end, so the parent\'s read() blocks forever after the data.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char buf[16];
    int n;
    pipe(fd);
    if (fork() == 0) {
        close(fd[0]);
        write(fd[1], "data", 4);
        printf("child exits\\n");
        exit(0);
    }
    /* forgot: close(fd[1]); */
    while ((n = read(fd[0], buf, sizeof(buf) - 1)) > 0) {
        buf[n] = '\\0';
        printf("parent got %s\\n", buf);
    }
    printf("never printed\\n");
    return 0;
}`,
  },
  {
    id: 'pipe-barrier',
    name: 'Pipe as a barrier',
    mode: 'line',
    note: 'Without the pipe the child could print first. Blocking on a one-byte read makes "parent first" always come first.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char go;
    pipe(fd);
    if (fork() == 0) {
        close(fd[1]);
        read(fd[0], &go, 1);
        printf("child second\\n");
        exit(0);
    }
    close(fd[0]);
    printf("parent first\\n");
    write(fd[1], "x", 1);
    close(fd[1]);
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-race',
    name: 'Pipe: what a read does not order',
    mode: 'line',
    note: 'The read happens after the write, so after "child before write". It says nothing about "child after write", which can land on either side of "parent read it".',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char c;
    pipe(fd);
    if (fork() == 0) {
        close(fd[0]);
        printf("child before write\\n");
        write(fd[1], "!", 1);
        printf("child after write\\n");
        exit(0);
    }
    close(fd[1]);
    read(fd[0], &c, 1);
    printf("parent read it\\n");
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-pingpong',
    name: 'Ping-pong with two pipes',
    mode: 'line',
    note: 'One pipe each way. Each side blocks until the other has printed, so the output strictly alternates: one possible output.',
    code: `${PIPE_HEAD}
int main(void) {
    int to_child[2], to_parent[2];
    char c;
    pipe(to_child);
    pipe(to_parent);
    if (fork() == 0) {
        for (int i = 0; i < 3; i++) {
            read(to_child[0], &c, 1);
            printf("pong %d\\n", i);
            write(to_parent[1], "x", 1);
        }
        exit(0);
    }
    for (int i = 0; i < 3; i++) {
        printf("ping %d\\n", i);
        write(to_child[1], "x", 1);
        read(to_parent[0], &c, 1);
    }
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-deadlock',
    name: 'Deadlock: both sides read first',
    mode: 'line',
    note: 'Each process waits for the other to write. Both lines print, in either order, and then nothing can run.',
    code: `${PIPE_HEAD}
int main(void) {
    int a[2], b[2];
    char c;
    pipe(a);
    pipe(b);
    if (fork() == 0) {
        printf("child waits\\n");
        read(a[0], &c, 1);
        write(b[1], "x", 1);
        exit(0);
    }
    printf("parent waits\\n");
    read(b[0], &c, 1);
    write(a[1], "x", 1);
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-echo-wc',
    name: 'echo one two three | wc -w',
    mode: 'line',
    note: 'What a shell does for a pipeline: two children, dup2 onto stdout and stdin, then exec. The parent must close both ends or wc never sees end of file.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    pipe(fd);
    if (fork() == 0) {
        dup2(fd[1], STDOUT_FILENO);
        close(fd[0]);
        close(fd[1]);
        execlp("echo", "echo", "one", "two", "three", (char *) NULL);
    }
    if (fork() == 0) {
        dup2(fd[0], STDIN_FILENO);
        close(fd[0]);
        close(fd[1]);
        execlp("wc", "wc", "-w", (char *) NULL);
    }
    close(fd[0]);
    close(fd[1]);
    wait(NULL);
    wait(NULL);
    printf("pipeline done\\n");
    return 0;
}`,
  },
  {
    id: 'pipe-sort',
    name: 'Parent feeds sort',
    mode: 'line',
    note: 'sort prints nothing until end of file, which comes when the parent closes its write end; "sent" may print before or after the sorted lines.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    pipe(fd);
    if (fork() == 0) {
        dup2(fd[0], STDIN_FILENO);
        close(fd[0]);
        close(fd[1]);
        execlp("sort", "sort", (char *) NULL);
    }
    close(fd[0]);
    write(fd[1], "cherry\\n", 7);
    write(fd[1], "apple\\n", 6);
    write(fd[1], "banana\\n", 7);
    close(fd[1]);
    printf("sent\\n");
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-three-stage',
    name: 'echo hello pipes | tr a-z A-Z | rev',
    mode: 'line',
    note: 'Three children and two pipes. Every process closes every pipe end it does not use; leave one open and the pipeline hangs.',
    code: `${PIPE_HEAD}
int main(void) {
    int p1[2], p2[2];
    pipe(p1);
    pipe(p2);
    if (fork() == 0) {
        dup2(p1[1], 1);
        close(p1[0]); close(p1[1]); close(p2[0]); close(p2[1]);
        execlp("echo", "echo", "hello", "pipes", (char *) NULL);
    }
    if (fork() == 0) {
        dup2(p1[0], 0);
        dup2(p2[1], 1);
        close(p1[0]); close(p1[1]); close(p2[0]); close(p2[1]);
        execlp("tr", "tr", "a-z", "A-Z", (char *) NULL);
    }
    if (fork() == 0) {
        dup2(p2[0], 0);
        close(p1[0]); close(p1[1]); close(p2[0]); close(p2[1]);
        execlp("rev", "rev", (char *) NULL);
    }
    close(p1[0]); close(p1[1]); close(p2[0]); close(p2[1]);
    for (int i = 0; i < 3; i++)
        wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-relay',
    name: 'Relay through a grandchild',
    mode: 'line',
    note: 'Parent to child to grandchild over two pipes. Each hop is a happens-before edge, so the three lines come out in one order.',
    code: `${PIPE_HEAD}
int main(void) {
    int up[2], down[2];
    char buf[16];
    pipe(up);
    if (fork() == 0) {
        close(up[1]);
        read(up[0], buf, sizeof(buf));
        printf("child got %s\\n", buf);
        pipe(down);
        if (fork() == 0) {
            close(down[1]);
            read(down[0], buf, sizeof(buf));
            printf("grandchild got %s\\n", buf);
            exit(0);
        }
        close(down[0]);
        write(down[1], buf, strlen(buf) + 1);
        wait(NULL);
        exit(0);
    }
    close(up[0]);
    printf("parent sends baton\\n");
    write(up[1], "baton", 6);
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-chunks',
    name: 'Pipe: reading in small pieces',
    mode: 'line',
    note: 'A read returns at most the size asked for; the rest stays in the pipe for the next read.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char buf[5];
    int n;
    pipe(fd);
    if (fork() == 0) {
        close(fd[0]);
        write(fd[1], "abcdefghij", 10);
        exit(0);
    }
    close(fd[1]);
    while ((n = read(fd[0], buf, 4)) > 0) {
        buf[n] = '\\0';
        printf("[%s]\\n", buf);
    }
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-holders',
    name: 'EOF waits for every write end',
    mode: 'line',
    note: 'Child B never writes, but it inherited a write end and keeps it until it exits, so "end of file" always comes after "B exits".',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char buf[8];
    int n;
    pipe(fd);
    if (fork() == 0) {
        write(fd[1], "A", 1);
        exit(0);
    }
    if (fork() == 0) {
        printf("B exits\\n");
        exit(0);
    }
    close(fd[1]);
    while ((n = read(fd[0], buf, sizeof(buf))) > 0)
        printf("read %d byte\\n", n);
    printf("end of file\\n");
    wait(NULL);
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-squares',
    name: 'One pipe per child',
    mode: 'line',
    note: 'A new pipe in each iteration. The parent reads each result before forking the next child, so the children run one after another.',
    code: `${PIPE_HEAD}
int main(void) {
    for (int i = 1; i <= 3; i++) {
        int fd[2];
        int r;
        pipe(fd);
        if (fork() == 0) {
            int sq = i * i;
            printf("child %d working\\n", i);
            write(fd[1], &sq, sizeof(sq));
            exit(0);
        }
        close(fd[1]);
        read(fd[0], &r, sizeof(r));
        close(fd[0]);
        printf("%d squared is %d\\n", i, r);
    }
    while (wait(NULL) > 0)
        ;
    return 0;
}`,
  },
  {
    id: 'pipe-buffer-lands',
    name: 'Buffered printf lands in the pipe',
    mode: 'line',
    note: '"hi " was still in the stdio buffer when the child pointed fd 1 at the pipe, so it is flushed into the pipe, not to the terminal.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char buf[32];
    pipe(fd);
    if (fork() == 0) {
        close(fd[0]);
        printf("hi ");
        dup2(fd[1], 1);
        printf("there\\n");
        exit(0);
    }
    close(fd[1]);
    int n = read(fd[0], buf, sizeof(buf) - 1);
    buf[n] = '\\0';
    printf("parent got: %s", buf);
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-redirect-full',
    name: 'stdout into a pipe is fully buffered',
    mode: 'line',
    note: 'stdio chooses its buffering on first use. fd 1 is already a pipe then, so both lines wait in the buffer and arrive as one write at exit.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char buf[64];
    int n;
    pipe(fd);
    if (fork() == 0) {
        dup2(fd[1], 1);
        close(fd[0]);
        close(fd[1]);
        printf("one\\n");
        printf("two\\n");
        exit(0);
    }
    close(fd[1]);
    while ((n = read(fd[0], buf, sizeof(buf) - 1)) > 0) {
        buf[n] = '\\0';
        printf("chunk of %d bytes: %s", n, buf);
    }
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-cat',
    name: 'cat forwards as it reads',
    mode: 'line',
    note: 'cat writes each chunk as soon as it reads it, so "first" can be printed before or after the parent says it sent both.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    pipe(fd);
    if (fork() == 0) {
        dup2(fd[0], 0);
        close(fd[0]);
        close(fd[1]);
        execlp("cat", "cat", (char *) NULL);
    }
    close(fd[0]);
    write(fd[1], "first\\n", 6);
    write(fd[1], "second\\n", 7);
    printf("parent sent both\\n");
    close(fd[1]);
    wait(NULL);
    printf("cat finished\\n");
    return 0;
}`,
  },
  {
    id: 'pipe-status',
    name: 'Pipe vs exit status',
    mode: 'line',
    note: 'An exit status keeps only the low 8 bits (300 becomes 44); a pipe carries the whole int.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    int status, value;
    pipe(fd);
    if (fork() == 0) {
        int v = 300;
        close(fd[0]);
        write(fd[1], &v, sizeof(v));
        exit(v);
    }
    close(fd[1]);
    read(fd[0], &value, sizeof(value));
    wait(&status);
    printf("pipe says %d, exit status says %d\\n", value, WEXITSTATUS(status));
    return 0;
}`,
  },
  {
    id: 'pipe-grep',
    name: 'Filtering with grep',
    mode: 'line',
    note: 'grep keeps the lines containing "o" and exits with 0 because something matched.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    int status;
    pipe(fd);
    if (fork() == 0) {
        dup2(fd[0], 0);
        close(fd[0]);
        close(fd[1]);
        execlp("grep", "grep", "o", (char *) NULL);
    }
    close(fd[0]);
    char *words = "one\\ntwo\\nthree\\nfour\\n";
    write(fd[1], words, strlen(words));
    close(fd[1]);
    wait(&status);
    printf("grep exited with %d\\n", WEXITSTATUS(status));
    return 0;
}`,
  },
  {
    id: 'pipe-dup',
    name: 'close(1) then dup()',
    mode: 'line',
    note: 'The older idiom for dup2: dup() returns the lowest free descriptor, which is 1 right after close(1).',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char buf[32];
    int n;
    pipe(fd);
    if (fork() == 0) {
        close(1);
        dup(fd[1]);
        close(fd[0]);
        close(fd[1]);
        execlp("echo", "echo", "via dup", (char *) NULL);
    }
    close(fd[1]);
    n = read(fd[0], buf, sizeof(buf) - 1);
    buf[n] = '\\0';
    printf("parent got: %s", buf);
    wait(NULL);
    return 0;
}`,
  },
  {
    id: 'pipe-self',
    name: 'A pipe inside one process',
    mode: 'line',
    note: 'A process can read its own pipe. Swap the write and the read and it blocks forever: it holds the only write end itself.',
    code: `${PIPE_HEAD}
int main(void) {
    int fd[2];
    char buf[16];
    pipe(fd);
    printf("fds %d and %d\\n", fd[0], fd[1]);
    write(fd[1], "echo!", 6);
    read(fd[0], buf, sizeof(buf));
    printf("read back %s\\n", buf);
    return 0;
}`,
  },
];
