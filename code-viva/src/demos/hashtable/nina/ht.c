#include <stdlib.h>
#include <string.h>
#include "ht.h"

unsigned long h(const char *s) {
    unsigned long x = 0;
    while (*s) x = x * 31 + *s++;
    return x;
}

void ht_put(HashTable *t, const char *k, int v) {
    unsigned long i = h(k) % t->capacity;
    Node *p = t->buckets[i];
    while (p) {
        if (!strcmp(p->key, k)) { p->value = v; return; }
        p = p->next;
    }
    Node *n2 = malloc(sizeof *n2);
    n2->key = strdup(k);
    n2->value = v;
    n2->next = t->buckets[i];
    t->buckets[i] = n2;
    t->size++;
    if (t->size * 4 > t->capacity * 3) {
        Node **nb = calloc(t->capacity * 2, sizeof *nb);
        for (size_t j = 0; j < t->capacity; j++) {
            Node *q = t->buckets[j];
            while (q) {
                Node *tmp1 = q->next;
                unsigned long s2 = h(q->key) % (t->capacity * 2);
                q->next = nb[s2];
                nb[s2] = q;
                q = tmp1;
            }
        }
        free(t->buckets);
        t->buckets = nb;
        t->capacity *= 2;
    }
}

int ht_get(const HashTable *t, const char *k, int *out) {
    for (Node *p = t->buckets[h(k) % t->capacity]; p; p = p->next) {
        if (!strcmp(p->key, k)) { *out = p->value; return 1; }
    }
    return 0;
}

void ht_free(HashTable *t) {
    for (size_t j = 0; j < t->capacity; j++) {
        Node *p = t->buckets[j];
        while (p) { Node *n = p->next; free(p); p = n; }
    }
    free(t->buckets);
    free(t);
}
